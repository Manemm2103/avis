import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./src/config.js";
import { demoOrders } from "./src/demo-orders.js";
import { authenticateWithLdap } from "./src/ldap-auth.js";
import { LocalStore } from "./src/local-store.js";
import { MAIL_TEXT_MARKS, sendAvisMail } from "./src/mail-service.js";
import { fetchOrdersFromMssql, fetchToursFromMssql, isMssqlConfigured } from "./src/mssql-source.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const store = new LocalStore(config.dataFile);
await store.init();
await store.ensureDefaultUser(config.auth.defaultAdminUser, config.auth.defaultAdminPassword);

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use((request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    app: "avis",
    mssqlConfigured: isMssqlConfigured(effectiveMssqlConfig())
  });
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const username = normalizeRequiredText(request.body.username, "Benutzername");
    const password = normalizeRequiredText(request.body.password, "Passwort");
    response.json(await loginUser(username, password));
  } catch (error) {
    response.status(401).json({
      error: "LOGIN_FAILED",
      message: error.message
    });
  }
});

app.use("/api", requireAuth);

app.get("/api/auth/me", (request, response) => {
  response.json(request.user);
});

app.post("/api/auth/logout", async (request, response) => {
  await store.logout(request.token);
  response.json({ ok: true });
});

app.get("/api/users", requireAdmin, async (request, response) => {
  response.json(await store.listUsers());
});

app.post("/api/users", requireAdmin, async (request, response) => {
  try {
    const user = await store.createUser(sanitizeUser(request.body), request.user);
    response.status(201).json(user);
  } catch (error) {
    response.status(400).json({
      error: "USER_CREATE_FAILED",
      message: error.message
    });
  }
});

app.patch("/api/users/:id", requireAdmin, async (request, response) => {
  try {
    const user = await store.updateUser(request.params.id, sanitizeUser(request.body, true), request.user);
    response.json(user);
  } catch (error) {
    response.status(400).json({
      error: "USER_UPDATE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/sql-settings", requireFullAdmin, (request, response) => {
  response.json(store.getSqlSettings({
    ordersQuery: config.mssql.query,
    toursQuery: config.mssql.toursQuery
  }));
});

app.patch("/api/sql-settings", requireFullAdmin, async (request, response) => {
  try {
    const settings = await store.updateSqlSettings(sanitizeSqlSettings(request.body), request.user);
    response.json(settings);
  } catch (error) {
    response.status(400).json({
      error: "SQL_SETTINGS_SAVE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/ldap-settings", requireFullAdmin, (request, response) => {
  response.json(store.getLdapSettings());
});

app.patch("/api/ldap-settings", requireFullAdmin, async (request, response) => {
  try {
    const settings = await store.updateLdapSettings(sanitizeLdapSettings(request.body), request.user);
    response.json(settings);
  } catch (error) {
    response.status(400).json({
      error: "LDAP_SETTINGS_SAVE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/mail-settings", requireAdmin, (request, response) => {
  response.json(publicMailSettings(store.getMailSettings(), isFullAdminRole(request.user)));
});

app.patch("/api/mail-settings", requireAdmin, async (request, response) => {
  try {
    const settings = await store.updateMailSettings(sanitizeMailSettings(request.body, isFullAdminRole(request.user)), request.user);
    response.json(publicMailSettings(settings, isFullAdminRole(request.user)));
  } catch (error) {
    response.status(400).json({
      error: "MAIL_SETTINGS_SAVE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/orders", async (request, response) => {
  try {
    const source = await loadSourceOrders();
    const allOrders = await loadMergedOrders(source.orders);
    const filters = readOrderFilters(request.query);
    const ordersBeforeTourFilter = applyOrderFilters(allOrders, filters, { includeTour: false });
    const ordersBeforeWeekFilter = applyOrderFilters(allOrders, filters, {
      includeDeliveryWeek: false,
      includeTour: true
    });
    const orders = applyOrderFilters(ordersBeforeTourFilter, filters, { includeTour: true });

    response.json({
      usingDemoData: source.usingDemoData,
      orders,
      summary: createSummary(allOrders),
      availableTours: uniqueTours(ordersBeforeTourFilter),
      availableWeeks: uniqueWeeks(ordersBeforeWeekFilter)
    });
  } catch (error) {
    response.status(500).json({
      error: "ORDERS_LOAD_FAILED",
      message: error.message
    });
  }
});

app.get("/api/tours", async (request, response) => {
  try {
    const tours = await loadTours();
    response.json(tours);
  } catch (error) {
    response.status(500).json({
      error: "TOURS_LOAD_FAILED",
      message: error.message
    });
  }
});

app.patch("/api/orders/bulk", async (request, response) => {
  try {
    const update = sanitizeBulkAvisUpdate(request.body);
    const saved = [];
    const avisOverrides = new Map();
    const mailOrderNumbers = [];

    for (const orderNumber of update.orderNumbers) {
      const currentAvis = store.getAvis(orderNumber);
      const shouldSendMail = update.values.notified === true && !currentAvis?.notified;
      const savedAvis = await store.updateAvis(orderNumber, update.values, request.user);

      saved.push(savedAvis);
      avisOverrides.set(orderNumber, savedAvis);

      if (shouldSendMail) {
        mailOrderNumbers.push(orderNumber);
      }
    }

    response.json({
      updated: saved.length,
      mail: await sendAvisMailsForOrders(mailOrderNumbers, avisOverrides, request.user)
    });
  } catch (error) {
    response.status(400).json({
      error: "BULK_SAVE_FAILED",
      message: error.message
    });
  }
});

app.post("/api/local-orders", async (request, response) => {
  try {
    const order = sanitizeLocalOrder(request.body, "manual");
    const driverPhoneId = text(request.body.driverPhoneId);
    const knownOrderNumbers = await listKnownOrderNumbers();

    if (knownOrderNumbers.has(order.orderNumber)) {
      throw new Error("Auftragsnummer ist bereits vorhanden.");
    }

    response.status(201).json(await store.createLocalOrder(order, request.user, { driverPhoneId }));
  } catch (error) {
    response.status(400).json({
      error: "LOCAL_ORDER_CREATE_FAILED",
      message: error.message
    });
  }
});

app.post("/api/local-orders/import", async (request, response) => {
  try {
    const rows = Array.isArray(request.body.orders) ? request.body.orders : [];
    const knownOrderNumbers = await listKnownOrderNumbers();
    const result = {
      created: 0,
      skipped: 0,
      errors: []
    };

    for (const [index, row] of rows.entries()) {
      try {
        const order = sanitizeLocalOrder(row, "csv");

        if (knownOrderNumbers.has(order.orderNumber)) {
          result.skipped += 1;
          continue;
        }

        await store.createLocalOrder(order, request.user);
        knownOrderNumbers.add(order.orderNumber);
        result.created += 1;
      } catch (error) {
        result.errors.push({
          row: index + 2,
          message: error.message
        });
      }
    }

    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: "LOCAL_ORDER_IMPORT_FAILED",
      message: error.message
    });
  }
});

app.delete("/api/local-orders/:orderNumber", requireAdmin, async (request, response) => {
  try {
    const orderNumber = normalizeRequiredText(request.params.orderNumber, "Auftrag");
    response.json(await store.deleteLocalOrder(orderNumber));
  } catch (error) {
    response.status(400).json({
      error: "LOCAL_ORDER_DELETE_FAILED",
      message: error.message
    });
  }
});

app.patch("/api/orders/:orderNumber", async (request, response) => {
  try {
    const orderNumber = normalizeRequiredText(request.params.orderNumber, "Auftrag");
    const update = sanitizeAvisUpdate(request.body);
    const currentAvis = store.getAvis(orderNumber);
    const shouldSendMail = update.notified === true && !currentAvis?.notified;

    if (Object.hasOwn(update, "deliveryDate") && !store.hasLocalOrder(orderNumber)) {
      throw new Error("Liefertermin kann nur bei selbst angelegten oder importierten Auftraegen geaendert werden.");
    }

    const saved = await store.updateAvis(orderNumber, update, request.user);
    const mail = shouldSendMail ? await sendAvisMailForOrder(orderNumber, saved, request.user) : null;

    response.json({ avis: saved, mail });
  } catch (error) {
    response.status(400).json({
      error: "ORDER_SAVE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/driver-phones", async (request, response) => {
  response.json(await store.listDriverPhones());
});

app.post("/api/driver-phones", requireAdmin, async (request, response) => {
  try {
    const driver = await store.createDriverPhone(sanitizeDriverPhone(request.body));
    response.status(201).json(driver);
  } catch (error) {
    response.status(400).json({
      error: "DRIVER_CREATE_FAILED",
      message: error.message
    });
  }
});

app.patch("/api/driver-phones/:id", requireAdmin, async (request, response) => {
  try {
    const driver = await store.updateDriverPhone(request.params.id, sanitizeDriverPhone(request.body, true));
    response.json(driver);
  } catch (error) {
    response.status(400).json({
      error: "DRIVER_UPDATE_FAILED",
      message: error.message
    });
  }
});

app.delete("/api/driver-phones/:id", requireAdmin, async (request, response) => {
  try {
    const result = await store.deleteDriverPhone(request.params.id, request.user);
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: "DRIVER_DELETE_FAILED",
      message: error.message
    });
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(config.port, () => {
  console.log(`AVIS listening on port ${config.port}`);
});

async function loginUser(username, password) {
  let ldapError = null;
  const ldapSettings = store.getLdapSettings();

  if (ldapSettings.enabled) {
    try {
      const ldapUser = await authenticateWithLdap(ldapSettings, username, password);

      if (ldapUser) {
        const user = await store.upsertLdapUser(ldapUser);
        return store.createSessionForUserId(user.id);
      }
    } catch (error) {
      ldapError = error;
    }
  }

  try {
    return await store.login(username, password);
  } catch (localError) {
    throw ldapError || localError;
  }
}

async function loadSourceOrders() {
  const source = await loadExternalOrders();
  const localOrders = await store.listLocalOrders();
  const sourceOrderNumbers = new Set(source.orders.map((order) => order.orderNumber));
  const mergedOrders = [
    ...source.orders,
    ...localOrders
      .map((order) => normalizeOrder(order, order.origin || "manual", true))
      .filter((order) => order.orderNumber && !sourceOrderNumbers.has(order.orderNumber))
  ];

  return {
    usingDemoData: source.usingDemoData,
    orders: mergedOrders
  };
}

async function loadMergedOrders(sourceOrders, avisOverrides = new Map()) {
  const drivers = await store.listDriverPhones();
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));

  return sourceOrders.map((order) => mergeOrder(order, avisOverrides.get(order.orderNumber) || store.getAvis(order.orderNumber), driverMap));
}

async function sendAvisMailForOrder(orderNumber, avisOverride, actor) {
  const results = await sendAvisMailsForOrders([orderNumber], new Map([[orderNumber, avisOverride]]), actor);
  return results.items[0] || skippedMailResult("Auftrag wurde fuer den Mailversand nicht gefunden.");
}

async function sendAvisMailsForOrders(orderNumbers, avisOverrides = new Map(), actor = null) {
  if (orderNumbers.length === 0) {
    return summarizeMailResults([]);
  }

  let orders = [];

  try {
    const source = await loadSourceOrders();
    orders = await loadMergedOrders(source.orders, avisOverrides);
  } catch (error) {
    return summarizeMailResults(orderNumbers.map((orderNumber) => failedMailResult(`Auftrag ${orderNumber}: ${error.message}`)));
  }

  const orderMap = new Map(orders.map((order) => [order.orderNumber, order]));
  const settings = store.getMailSettings();
  const results = [];

  for (const orderNumber of orderNumbers) {
    const order = orderMap.get(orderNumber);

    if (!order) {
      results.push(skippedMailResult(`Auftrag ${orderNumber} wurde fuer den Mailversand nicht gefunden.`));
      continue;
    }

    const result = await sendAvisMail(order, settings);
    logAvisMailResult(orderNumber, settings, result);

    if (result.sent) {
      try {
        result.mailLogId = (await store.appendAvisMail(orderNumber, result, actor)).id;
      } catch (error) {
        result.mailLogError = error.message;
        logEvent("error", "avis-mail-log-save-failed", {
          orderNumber,
          message: error.message
        });
      }
    }

    results.push(result);
  }

  return summarizeMailResults(results);
}

async function loadTours() {
  const source = await loadSourceOrders();
  const mssqlConfig = effectiveMssqlConfig();
  let tours = [];

  if (!source.usingDemoData && mssqlConfig.toursQuery) {
    const rows = await fetchToursFromMssql(mssqlConfig);
    tours = rows.map((row) => text(row.TOX_Bezeichnung ?? row.tox_bezeichnung ?? row.TOUR ?? row.tour));
  }

  if (tours.length === 0) {
    tours = source.orders.map((order) => order.tour);
  }

  return [...new Set(tours.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

async function loadExternalOrders() {
  const mssqlConfig = effectiveMssqlConfig();

  if (!isMssqlConfigured(mssqlConfig)) {
    return {
      usingDemoData: true,
      orders: demoOrders.map((order) => normalizeOrder(order, "demo", false)).filter((order) => order.orderNumber)
    };
  }

  const rows = await fetchOrdersFromMssql(mssqlConfig);
  return {
    usingDemoData: false,
    orders: rows.map((row) => normalizeOrder(row, "mssql", false)).filter((order) => order.orderNumber)
  };
}

async function listKnownOrderNumbers() {
  const source = await loadExternalOrders();
  const localOrders = await store.listLocalOrders();

  return new Set([
    ...source.orders.map((order) => order.orderNumber),
    ...localOrders.map((order) => order.orderNumber)
  ].filter(Boolean));
}

function effectiveMssqlConfig() {
  const settings = store.getSqlSettings();

  return {
    ...config.mssql,
    query: settings.ordersQuery || config.mssql.query,
    toursQuery: settings.toursQuery || config.mssql.toursQuery
  };
}

function normalizeOrder(row, origin = "mssql", canDelete = false) {
  return {
    orderNumber: text(row.orderNumber ?? row.ABNUMMER ?? row.abnummer),
    customerNumber: text(row.customerNumber ?? row.KDNR ?? row.kdnr),
    customerName: text(row.customerName ?? row.KUNDE ?? row.kunde),
    customerAddress: text(row.customerAddress ?? row.KUNDE_ANSCHRIFT ?? row.kunde_anschrift),
    commission: text(row.commission ?? row.KOMMISSION ?? row.kommission),
    deliveryAddress: text(row.deliveryAddress ?? row.KAPA_LIEFERANSCHRIFT ?? row.kapa_lieferanschrift),
    deliveryDate: dateText(row.deliveryDate ?? row.LIEFERTERMIN ?? row.liefertermin),
    sourcePhone: text(row.sourcePhone ?? row.KAPA_TELEFON ?? row.kapa_telefon),
    sourceEmail: text(row.sourceEmail ?? row.KAPA_EMAIL ?? row.kapa_email),
    tour: text(row.tour ?? row.KAPA_TOUR ?? row.kapa_tour ?? row.TOUR ?? row.tour),
    origin,
    canDelete
  };
}

function mergeOrder(order, avis, driverMap) {
  const driver = avis?.driverPhoneId ? driverMap.get(avis.driverPhoneId) : null;
  const displayDeliveryDate = avis?.deliveryDate || order.deliveryDate;

  return {
    ...order,
    displayDeliveryDate,
    displayDeliveryWeek: isoWeekText(displayDeliveryDate),
    displayTour: order.tour,
    avis: {
      deliveryDate: avis?.deliveryDate || "",
      driverPhoneId: avis?.driverPhoneId || "",
      driverPhoneLabel: driver ? `${driver.label} (${driver.phone})` : "",
      driverPhoneName: driver?.label || "",
      driverPhoneNumber: driver?.phone || "",
      twoDayTour: Boolean(avis?.twoDayTour),
      notified: Boolean(avis?.notified),
      notifiedAt: avis?.notifiedAt || "",
      notifiedBy: avis?.notifiedBy || "",
      note: avis?.note || "",
      customerInfo: avis?.customerInfo || "",
      updatedAt: avis?.updatedAt || "",
      updatedBy: avis?.updatedBy || "",
      log: avis?.log || [],
      mailLog: avis?.mailLog || []
    }
  };
}

function createSummary(orders) {
  const notified = orders.filter((order) => order.avis.notified).length;

  return {
    total: orders.length,
    notified,
    open: orders.length - notified
  };
}

function summarizeMailResults(results) {
  const items = results.filter(Boolean);

  return {
    total: items.length,
    sent: items.filter((item) => item.sent).length,
    skipped: items.filter((item) => item.skipped).length,
    failed: items.filter((item) => item.failed).length,
    messages: [...new Set(items.map((item) => item.message).filter(Boolean))],
    items
  };
}

function skippedMailResult(message) {
  return {
    status: "skipped",
    sent: false,
    skipped: true,
    failed: false,
    recipients: [],
    message,
    demoMode: false
  };
}

function failedMailResult(message) {
  return {
    status: "failed",
    sent: false,
    skipped: false,
    failed: true,
    recipients: [],
    message,
    demoMode: false
  };
}

function logAvisMailResult(orderNumber, settings, result) {
  const level = result.failed ? "error" : result.skipped ? "warn" : "info";

  logEvent(level, "avis-mail", {
    orderNumber,
    status: result.status,
    sent: Boolean(result.sent),
    skipped: Boolean(result.skipped),
    failed: Boolean(result.failed),
    demoMode: Boolean(result.demoMode),
    recipientCount: Array.isArray(result.recipients) ? result.recipients.length : 0,
    smtpHost: settings.smtpHost || "",
    smtpPort: settings.smtpPort || 587,
    smtpSecure: Boolean(settings.smtpSecure),
    smtpVerifyCertificate: settings.smtpVerifyCertificate !== false,
    smtpCertificateConfigured: Boolean(settings.smtpCertificate),
    message: result.message || "",
    hint: result.hint || "",
    code: result.code || "",
    command: result.command || "",
    responseCode: result.responseCode || "",
    messageId: result.messageId || ""
  });
}

function logEvent(level, event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    ...details
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function readOrderFilters(query) {
  return {
    status: String(query.status || "all"),
    search: String(query.search || "").trim().toLowerCase(),
    deliveryDate: String(query.deliveryDate || "").trim(),
    deliveryWeek: String(query.deliveryWeek || "").trim(),
    tour: String(query.tour || "").trim()
  };
}

function applyOrderFilters(orders, filters, options = {}) {
  let result = orders;

  if (filters.status === "open") {
    result = result.filter((order) => !order.avis.notified);
  }

  if (filters.status === "notified") {
    result = result.filter((order) => order.avis.notified);
  }

  if (filters.search) {
    result = result.filter((order) => orderMatchesSearch(order, filters.search));
  }

  if (filters.deliveryDate) {
    result = result.filter((order) => order.displayDeliveryDate === filters.deliveryDate);
  }

  if (options.includeDeliveryWeek !== false && filters.deliveryWeek) {
    result = result.filter((order) => order.displayDeliveryWeek === filters.deliveryWeek);
  }

  if (options.includeTour && filters.tour) {
    result = result.filter((order) => order.tour === filters.tour);
  }

  return result;
}

function uniqueTours(orders) {
  return [...new Set(orders.map((order) => order.tour).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"));
}

function uniqueWeeks(orders) {
  return [...new Set(orders.map((order) => order.displayDeliveryWeek).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "de"));
}

function orderMatchesSearch(order, search) {
  if (search === "2-tagestour") {
    return Boolean(order.avis.twoDayTour);
  }

  return [
    order.orderNumber,
    order.customerNumber,
    order.customerName,
    order.customerAddress,
    order.commission,
    order.deliveryAddress,
    order.tour,
    order.sourcePhone,
    order.sourceEmail,
    order.avis.twoDayTour ? "2-Tagestour" : ""
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

function sanitizeAvisUpdate(input) {
  const update = {};

  if (Object.hasOwn(input, "deliveryDate")) {
    update.deliveryDate = dateText(input.deliveryDate);
  }

  if (Object.hasOwn(input, "driverPhoneId")) {
    update.driverPhoneId = text(input.driverPhoneId);
  }

  if (Object.hasOwn(input, "twoDayTour")) {
    update.twoDayTour = Boolean(input.twoDayTour);
  }

  if (Object.hasOwn(input, "notified")) {
    update.notified = Boolean(input.notified);
  }

  if (Object.hasOwn(input, "note")) {
    update.note = text(input.note);
  }

  if (Object.hasOwn(input, "customerInfo")) {
    update.customerInfo = text(input.customerInfo);
  }

  return update;
}

function sanitizeBulkAvisUpdate(input) {
  const orderNumbers = Array.isArray(input.orderNumbers)
    ? input.orderNumbers.map((value) => text(value)).filter(Boolean)
    : [];

  if (orderNumbers.length === 0) {
    throw new Error("Keine Auftraege fuer die Massenbearbeitung ausgewaehlt.");
  }

  const driverPhoneId = text(input.driverPhoneId);
  const values = {};

  if (driverPhoneId) {
    values.driverPhoneId = driverPhoneId;
  }

  if (input.twoDayTour === true) {
    values.twoDayTour = true;
  }

  if (input.notified === true) {
    if (!driverPhoneId) {
      throw new Error("Fahrertelefon fehlt.");
    }

    values.notified = true;
  }

  if (Object.keys(values).length === 0) {
    throw new Error("Keine Aenderung fuer die Massenbearbeitung ausgewaehlt.");
  }

  return {
    orderNumbers: [...new Set(orderNumbers)],
    values
  };
}

function sanitizeDriverPhone(input, partial = false) {
  const driver = {};

  if (Object.hasOwn(input, "label")) {
    driver.label = normalizeRequiredText(input.label, "Bezeichnung");
  } else if (!partial) {
    throw new Error("Bezeichnung fehlt.");
  }

  if (Object.hasOwn(input, "phone")) {
    driver.phone = normalizeRequiredText(input.phone, "Telefon");
  } else if (!partial) {
    throw new Error("Telefon fehlt.");
  }

  if (Object.hasOwn(input, "active")) {
    driver.active = Boolean(input.active);
  } else if (!partial) {
    driver.active = true;
  }

  return driver;
}

function sanitizeSqlSettings(input) {
  const settings = {};

  if (Object.hasOwn(input, "ordersQuery")) {
    settings.ordersQuery = String(input.ordersQuery || "").trim();
  }

  if (Object.hasOwn(input, "toursQuery")) {
    settings.toursQuery = String(input.toursQuery || "").trim();
  }

  return settings;
}

function sanitizeLdapSettings(input) {
  const settings = {};

  if (Object.hasOwn(input, "enabled")) {
    settings.enabled = Boolean(input.enabled);
  }

  for (const field of [
    "name",
    "host",
    "bindDn",
    "bindPassword",
    "baseDn",
    "userFilter",
    "loginAttribute",
    "adminGroupDn",
    "departmentLeadGroupDn",
    "certificate"
  ]) {
    if (Object.hasOwn(input, field)) {
      settings[field] = text(input[field]);
    }
  }

  if (Object.hasOwn(input, "port")) {
    settings.port = number(input.port, 636);
  }

  if (Object.hasOwn(input, "verifyCertificate")) {
    settings.verifyCertificate = Boolean(input.verifyCertificate);
  }

  return settings;
}

function sanitizeMailSettings(input, fullAdmin) {
  const settings = {};

  if (Object.hasOwn(input, "subject")) {
    settings.subject = normalizeRequiredText(input.subject, "Betreff");
  }

  if (Object.hasOwn(input, "body")) {
    settings.body = normalizeRequiredText(input.body, "Mailtext");
  }

  if (!fullAdmin) {
    return settings;
  }

  for (const field of [
    "smtpHost",
    "smtpCertificate",
    "smtpUser",
    "smtpPassword",
    "fromName",
    "fromEmail",
    "replyTo",
    "demoRecipients"
  ]) {
    if (Object.hasOwn(input, field)) {
      settings[field] = text(input[field]);
    }
  }

  if (Object.hasOwn(input, "smtpPort")) {
    settings.smtpPort = number(input.smtpPort, 587);
  }

  if (Object.hasOwn(input, "smtpSecure")) {
    settings.smtpSecure = Boolean(input.smtpSecure);
  }

  if (Object.hasOwn(input, "smtpVerifyCertificate")) {
    settings.smtpVerifyCertificate = Boolean(input.smtpVerifyCertificate);
  }

  if (Object.hasOwn(input, "demoMode")) {
    settings.demoMode = Boolean(input.demoMode);
  }

  return settings;
}

function publicMailSettings(settings, fullAdmin) {
  const result = {
    subject: settings.subject || "",
    body: settings.body || "",
    updatedAt: settings.updatedAt || "",
    updatedBy: settings.updatedBy || "",
    textMarks: MAIL_TEXT_MARKS
  };

  if (!fullAdmin) {
    return result;
  }

  return {
    ...result,
    smtpHost: settings.smtpHost || "",
    smtpPort: settings.smtpPort || 587,
    smtpSecure: Boolean(settings.smtpSecure),
    smtpVerifyCertificate: settings.smtpVerifyCertificate !== false,
    smtpCertificate: settings.smtpCertificate || "",
    smtpUser: settings.smtpUser || "",
    smtpPassword: settings.smtpPassword || "",
    fromName: settings.fromName || "",
    fromEmail: settings.fromEmail || "",
    replyTo: settings.replyTo || "",
    demoMode: settings.demoMode !== false,
    demoRecipients: settings.demoRecipients || ""
  };
}

function sanitizeLocalOrder(input, origin) {
  return {
    orderNumber: normalizeRequiredText(input.orderNumber ?? input.ABNUMMER, "Auftragsnummer"),
    customerNumber: text(input.customerNumber ?? input.KDNR),
    customerName: text(input.customerName ?? input.KUNDE),
    customerAddress: text(input.customerAddress ?? input.KUNDE_ANSCHRIFT),
    commission: text(input.commission ?? input.KOMMISSION),
    deliveryAddress: text(input.deliveryAddress ?? input.KAPA_LIEFERANSCHRIFT),
    deliveryDate: dateText(input.deliveryDate ?? input.LIEFERTERMIN),
    sourcePhone: text(input.sourcePhone ?? input.KAPA_TELEFON),
    sourceEmail: text(input.sourceEmail ?? input.KAPA_EMAIL),
    tour: text(input.tour ?? input.KAPA_TOUR ?? input.TOUR),
    origin
  };
}

function sanitizeUser(input, partial = false) {
  const user = {};

  if (Object.hasOwn(input, "username")) {
    user.username = normalizeRequiredText(input.username, "Benutzername");
  } else if (!partial) {
    throw new Error("Benutzername fehlt.");
  }

  if (Object.hasOwn(input, "displayName")) {
    user.displayName = normalizeRequiredText(input.displayName, "Name");
  } else if (!partial) {
    throw new Error("Name fehlt.");
  }

  if (Object.hasOwn(input, "password")) {
    const password = text(input.password);

    if (password) {
      user.password = password;
    } else if (!partial) {
      throw new Error("Passwort fehlt.");
    }
  } else if (!partial) {
    throw new Error("Passwort fehlt.");
  }

  if (Object.hasOwn(input, "role")) {
    const role = text(input.role) || "user";

    if (!["admin", "superuser", "user"].includes(role)) {
      throw new Error("Rolle ist ungueltig.");
    }

    user.role = role;
  } else if (!partial) {
    user.role = "user";
  }

  if (Object.hasOwn(input, "active")) {
    user.active = Boolean(input.active);
  } else if (!partial) {
    user.active = true;
  }

  return user;
}

function requireAuth(request, response, next) {
  const token = readBearerToken(request);
  const session = token ? store.getSession(token) : null;

  if (!session) {
    response.status(401).json({
      error: "AUTH_REQUIRED",
      message: "Bitte anmelden."
    });
    return;
  }

  request.token = token;
  request.user = session.user;
  next();
}

function requireAdmin(request, response, next) {
  if (!canManageMasterdata(request.user?.role)) {
    response.status(403).json({
      error: "ADMIN_REQUIRED",
      message: "Nur Admins duerfen diesen Bereich nutzen."
    });
    return;
  }

  next();
}

function requireFullAdmin(request, response, next) {
  if (!isFullAdminRole(request.user)) {
    response.status(403).json({
      error: "ADMIN_REQUIRED",
      message: "Nur Admins duerfen diesen Bereich nutzen."
    });
    return;
  }

  next();
}

function canManageMasterdata(role) {
  return ["admin", "superuser"].includes(role);
}

function isFullAdminRole(user) {
  return user?.role === "admin";
}

function readBearerToken(request) {
  const header = String(request.headers.authorization || "");
  const [scheme, token] = header.split(" ");

  if (scheme.toLowerCase() !== "bearer" || !token) {
    return "";
  }

  return token;
}

function normalizeRequiredText(value, label) {
  const result = text(value);

  if (!result) {
    throw new Error(`${label} fehlt.`);
  }

  return result;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateText(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  const germanDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (germanDate) {
    const [, day, month, year] = germanDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDate) {
    return isoDate[0];
  }

  return raw.slice(0, 10);
}

function isoWeekText(value) {
  const isoDate = dateText(value);
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}
