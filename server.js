import express from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./src/config.js";
import { demoOrders } from "./src/demo-orders.js";
import { authenticateWithLdap } from "./src/ldap-auth.js";
import { LocalStore } from "./src/local-store.js";
import { MAIL_TEXT_MARKS, sendAvisMail } from "./src/mail-service.js";
import { fetchOrdersFromMssql, fetchToursFromMssql, isMssqlConfigured } from "./src/mssql-source.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mailJobs = [];
let mailJobProcessorRunning = false;

const config = loadConfig();
const store = new LocalStore(config.dataFile);
await store.init();
await store.ensureDefaultUser(config.auth.defaultAdminUser, config.auth.defaultAdminPassword);

if (config.auth.resetAdminPassword) {
  await store.resetDefaultAdminPassword(config.auth.defaultAdminUser, config.auth.defaultAdminPassword);
  console.log(`AVIS admin password reset for user "${config.auth.defaultAdminUser}". Remove AVIS_RESET_ADMIN_PASSWORD after login.`);
}

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.text({
  limit: "10mb",
  type: ["text/*", "application/xml", "application/octet-stream"]
}));
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

app.get("/api/ptv/callback", receivePtvCallback);
app.post("/api/ptv/callback", receivePtvCallback);

async function receivePtvCallback(request, response) {
  try {
    const result = await importPtvCallback(readPtvCallbackPayload(request));

    console.log([
      `at=${new Date().toISOString()}`,
      "event=ptv-callback",
      `method=${request.method}`,
      `status=${result.status}`,
      `ticketid=${result.ticketid || ""}`,
      `orderCount=${result.orderNumbers.length}`
    ].join(" "));

    response.type("text/plain").send("OK");
  } catch (error) {
    console.error(`event=ptv-callback status=failed message=${error.message}`);
    response.status(400).type("text/plain").send(`ERROR: ${error.message}`);
  }
}

app.use("/api", requireAuth);

app.get("/api/auth/me", (request, response) => {
  response.json(request.user);
});

app.patch("/api/auth/me", async (request, response) => {
  try {
    response.json(await store.updateUserPreferences(request.user.id, sanitizeUserPreferences(request.body), request.user));
  } catch (error) {
    response.status(400).json({
      error: "PROFILE_UPDATE_FAILED",
      message: error.message
    });
  }
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

app.get("/api/mail-jobs", requireAdmin, async (request, response) => {
  try {
    response.json(await mailJobsOverview());
  } catch (error) {
    response.status(400).json({
      error: "MAIL_JOBS_FAILED",
      message: error.message
    });
  }
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

app.get("/api/ptv-settings", requireAdmin, (request, response) => {
  response.json(publicPtvSettings(store.getPtvSettings()));
});

app.patch("/api/ptv-settings", requireAdmin, async (request, response) => {
  try {
    const settings = await store.updatePtvSettings(sanitizePtvSettings(request.body), request.user);
    response.json(publicPtvSettings(settings));
  } catch (error) {
    response.status(400).json({
      error: "PTV_SETTINGS_SAVE_FAILED",
      message: error.message
    });
  }
});

app.get("/api/ptv/callbacks", requireAdmin, (request, response) => {
  response.json(store.listPtvCallbacks());
});

app.get("/api/ptv/exports", (request, response) => {
  response.json(store.listPtvExports());
});

app.post("/api/ptv/exports", async (request, response) => {
  try {
    const entry = await store.createPtvExport({
      name: text(request.body.name),
      orderNumbers: sanitizeOrderNumbers(request.body.orderNumbers)
    }, request.user);
    response.status(201).json(entry);
  } catch (error) {
    response.status(400).json({
      error: "PTV_EXPORT_CREATE_FAILED",
      message: error.message
    });
  }
});

app.delete("/api/ptv/exports/:id", async (request, response) => {
  try {
    response.json(await store.deletePtvExport(request.params.id));
  } catch (error) {
    response.status(400).json({
      error: "PTV_EXPORT_DELETE_FAILED",
      message: error.message
    });
  }
});

app.delete("/api/ptv/exports/:id/orders/:orderNumber", async (request, response) => {
  try {
    response.json(await store.removeOrderFromPtvExport(request.params.id, request.params.orderNumber, request.user));
  } catch (error) {
    response.status(400).json({
      error: "PTV_EXPORT_ORDER_REMOVE_FAILED",
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

app.post("/api/ptv/remote-url", async (request, response) => {
  try {
    const orderNumbers = sanitizeOrderNumbers(request.body.orderNumbers);
    const exportEntry = await store.createPtvExport({
      name: text(request.body.exportName),
      orderNumbers
    }, request.user);
    const settings = store.getPtvSettings();
    const source = await loadSourceOrders();
    const orders = await loadMergedOrders(source.orders);
    response.json(buildPtvRemoteUrl(settings, orderNumbers, orders, exportEntry));
  } catch (error) {
    response.status(400).json({
      error: "PTV_REMOTE_URL_FAILED",
      message: error.message
    });
  }
});

app.post("/api/ptv/exports/:id/remote-url", async (request, response) => {
  try {
    const exportEntry = store.getPtvExport(request.params.id);

    if (!exportEntry) {
      throw new Error("Tourzusammenstellung nicht gefunden.");
    }

    const orderNumbers = exportEntry.optimizedOrderNumbers?.length
      ? exportEntry.optimizedOrderNumbers
      : exportEntry.orderNumbers || [];
    const settings = store.getPtvSettings();
    const source = await loadSourceOrders();
    const orders = await loadMergedOrders(source.orders);

    response.json(buildPtvRemoteUrl(settings, orderNumbers, orders, exportEntry));
  } catch (error) {
    response.status(400).json({
      error: "PTV_EXPORT_REMOTE_URL_FAILED",
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

    if (update.values.notified === false && !canManageMasterdata(request.user?.role)) {
      throw new Error("Avisierungen dürfen per Massenbearbeitung nur von Admins und Abteilungsleitern zurückgenommen werden.");
    }

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

app.patch("/api/orders/sequence", async (request, response) => {
  try {
    response.json(await store.updateRouteSequence(sanitizeOrderNumbers(request.body.orderNumbers), request.user));
  } catch (error) {
    response.status(400).json({
      error: "ORDER_SEQUENCE_SAVE_FAILED",
      message: error.message
    });
  }
});

app.patch("/api/ptv/exports/:id/sequence", async (request, response) => {
  try {
    const orderNumbers = sanitizeOrderNumbers(request.body.orderNumbers);
    const exportEntry = await store.optimizePtvExport(request.params.id, orderNumbers, request.user);

    if (!exportEntry) {
      throw new Error("PTV-Export nicht gefunden.");
    }

    await store.updateRouteSequence(orderNumbers, request.user);
    response.json(exportEntry);
  } catch (error) {
    response.status(400).json({
      error: "PTV_EXPORT_SEQUENCE_SAVE_FAILED",
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

    if (shouldSendMail && request.body?.notifyAction !== true) {
      throw new Error("Avisiert kann nur über die Aktion Avisieren gesetzt werden.");
    }

    if (
      (Object.hasOwn(update, "deliveryDate") || Object.hasOwn(update, "deliveryAddress") || Object.hasOwn(update, "eprodStorageLocation"))
      && !store.hasLocalOrder(orderNumber)
    ) {
      throw new Error("Liefertermin, Lieferanschrift und Stellplatz können nur bei selbst angelegten oder importierten Aufträgen geändert werden.");
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

http.createServer(app).listen(config.port, () => {
  console.log(`AVIS listening on port ${config.port}`);
});

startHttpsServer();

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
  return results.items[0] || {
    status: "queued",
    queued: true,
    sent: false,
    skipped: false,
    failed: false,
    message: "Mailjob gestartet."
  };
}

async function sendAvisMailsForOrders(orderNumbers, avisOverrides = new Map(), actor = null) {
  if (orderNumbers.length === 0) {
    return summarizeMailResults([]);
  }

  return enqueueAvisMailJob(orderNumbers, actor);
}

function enqueueAvisMailJob(orderNumbers, actor = null) {
  const uniqueOrderNumbers = [...new Set(orderNumbers.map((orderNumber) => String(orderNumber || "").trim()).filter(Boolean))];
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    createdAt: now,
    startedAt: "",
    finishedAt: "",
    createdBy: actor?.displayName || actor?.username || "Unbekannt",
    createdByUserId: actor?.id || "",
    total: uniqueOrderNumbers.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    currentOrderNumber: "",
    message: "Mailjob wartet auf Verarbeitung.",
    items: uniqueOrderNumbers.map((orderNumber) => ({
      id: crypto.randomUUID(),
      orderNumber,
      status: "queued",
      queuedAt: now,
      startedAt: "",
      finishedAt: "",
      waitUntil: "",
      recipients: [],
      subject: "",
      message: "",
      customerName: "",
      commission: "",
      sent: false,
      skipped: false,
      failed: false
    }))
  };

  mailJobs.unshift(job);
  processMailJobs().catch((error) => {
    logEvent("error", "avis-mail-job-processor-failed", { message: error.message });
  });

  return summarizeMailResults(job.items.map((item) => ({
    status: "queued",
    queued: true,
    sent: false,
    skipped: false,
    failed: false,
    recipients: [],
    message: `Auftrag ${item.orderNumber}: Mailjob gestartet.`
  })));
}

async function processMailJobs() {
  if (mailJobProcessorRunning) {
    return;
  }

  mailJobProcessorRunning = true;

  try {
    for (const job of mailJobs.slice().reverse()) {
      if (!["queued", "running"].includes(job.status)) {
        continue;
      }

      await processMailJob(job);
    }
  } finally {
    mailJobProcessorRunning = false;
  }

  if (mailJobs.some((job) => ["queued", "running"].includes(job.status))) {
    setTimeout(() => {
      processMailJobs().catch((error) => {
        logEvent("error", "avis-mail-job-processor-failed", { message: error.message });
      });
    }, 0);
  }
}

async function processMailJob(job) {
  job.status = "running";
  job.startedAt ||= new Date().toISOString();
  job.message = "Mailjob wird verarbeitet.";

  let orders = [];

  try {
    const source = await loadSourceOrders();
    orders = await loadMergedOrders(source.orders);
  } catch (error) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.failed = job.items.length;
    job.message = error.message;
    job.items.forEach((item) => {
      item.status = "failed";
      item.failed = true;
      item.message = `Auftrag ${item.orderNumber}: ${error.message}`;
      item.finishedAt = job.finishedAt;
    });
    return;
  }

  const orderMap = new Map(orders.map((order) => [order.orderNumber, order]));
  const settings = store.getMailSettings();
  const sendDelayMs = Math.max(0, number(settings.sendDelaySeconds, 0)) * 1000;
  const actor = {
    id: job.createdByUserId,
    username: job.createdBy,
    displayName: job.createdBy
  };

  for (const [index, item] of job.items.entries()) {
    if (!["queued", "waiting"].includes(item.status)) {
      continue;
    }

    if (index > 0 && sendDelayMs > 0) {
      item.status = "waiting";
      item.waitUntil = new Date(Date.now() + sendDelayMs).toISOString();
      job.currentOrderNumber = item.orderNumber;
      job.message = `Wartet bis ${item.waitUntil} vor der nächsten Mail.`;
      await sleep(sendDelayMs);
    }

    const order = orderMap.get(item.orderNumber);
    item.status = "sending";
    item.startedAt = new Date().toISOString();
    item.waitUntil = "";
    item.customerName = order?.customerName || "";
    item.commission = order?.commission || "";
    job.currentOrderNumber = item.orderNumber;

    if (!order) {
      Object.assign(item, skippedMailResult(`Auftrag ${item.orderNumber} wurde für den Mailversand nicht gefunden.`), {
        status: "skipped",
        finishedAt: new Date().toISOString()
      });
      updateMailJobCounts(job);
      continue;
    }

    const result = await sendAvisMail(order, settings);
    logAvisMailResult(item.orderNumber, settings, result);
    Object.assign(item, result, {
      status: result.sent ? "sent" : result.failed ? "failed" : "skipped",
      finishedAt: new Date().toISOString(),
      recipients: result.recipients || [],
      subject: result.subject || "",
      customerName: order.customerName || "",
      commission: order.commission || ""
    });

    if (result.sent) {
      try {
        item.mailLogId = (await store.appendAvisMail(item.orderNumber, result, actor)).id;
      } catch (error) {
        item.mailLogError = error.message;
        logEvent("error", "avis-mail-log-save-failed", {
          orderNumber: item.orderNumber,
          message: error.message
        });
      }
    }

    updateMailJobCounts(job);
  }

  updateMailJobCounts(job);
  job.status = job.failed > 0 ? "finished_with_errors" : "finished";
  job.finishedAt = new Date().toISOString();
  job.currentOrderNumber = "";
  job.message = job.failed > 0 ? "Mailjob mit Fehlern abgeschlossen." : "Mailjob abgeschlossen.";
}

function updateMailJobCounts(job) {
  job.sent = job.items.filter((item) => item.sent).length;
  job.skipped = job.items.filter((item) => item.skipped).length;
  job.failed = job.items.filter((item) => item.failed).length;
}

async function mailJobsOverview() {
  const source = await loadSourceOrders();
  const orders = await loadMergedOrders(source.orders);
  const orderMap = new Map(orders.map((order) => [order.orderNumber, order]));

  return {
    jobs: mailJobs.map((job) => publicMailJob(job, orderMap)),
    logs: store.listAvisMailLogs().map((entry) => publicMailLogEntry(entry, orderMap)).slice(0, 500)
  };
}

function publicMailJob(job, orderMap) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdBy: job.createdBy,
    total: job.total,
    sent: job.sent,
    skipped: job.skipped,
    failed: job.failed,
    currentOrderNumber: job.currentOrderNumber,
    message: job.message,
    items: job.items.map((item) => {
      const order = orderMap.get(item.orderNumber);

      return {
        id: item.id,
        orderNumber: item.orderNumber,
        status: item.status,
        queuedAt: item.queuedAt,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
        waitUntil: item.waitUntil,
        recipients: item.recipients || [],
        subject: item.subject || "",
        message: item.message || "",
        customerName: item.customerName || order?.customerName || "",
        commission: item.commission || order?.commission || "",
        sent: Boolean(item.sent),
        skipped: Boolean(item.skipped),
        failed: Boolean(item.failed)
      };
    })
  };
}

function publicMailLogEntry(entry, orderMap) {
  const order = orderMap.get(entry.orderNumber);

  return {
    id: entry.id,
    orderNumber: entry.orderNumber,
    sentAt: entry.sentAt || "",
    recipients: entry.recipients || [],
    subject: entry.subject || "",
    body: entry.body || "",
    status: entry.status || "sent",
    demoMode: Boolean(entry.demoMode),
    by: entry.by || "",
    customerName: order?.customerName || "",
    commission: order?.commission || ""
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const customerAddress = text(row.customerAddress ?? row.KUNDE_ANSCHRIFT ?? row.kunde_anschrift);
  const deliveryAddress = text(row.deliveryAddress ?? row.KAPA_LIEFERANSCHRIFT ?? row.kapa_lieferanschrift);
  const deliveryCountryFromAddress = countryFromAddressPrefix(deliveryAddress);
  const deliveryParts = splitDeliveryAddress(deliveryAddress, {
    country: row.deliveryCountry || row.KAPA_LIEFER_LAND || row.kapa_liefer_land || deliveryCountryFromAddress || countryFromAddressPrefix(customerAddress),
    postalCode: row.deliveryPostalCode ?? row.KAPA_LIEFER_PLZ ?? row.kapa_liefer_plz,
    street: row.deliveryStreet ?? row.KAPA_LIEFER_STRASSE ?? row.kapa_liefer_strasse,
    city: row.deliveryCity ?? row.KAPA_LIEFER_ORT ?? row.kapa_liefer_ort
  });

  return {
    orderNumber: text(row.orderNumber ?? row.ABNUMMER ?? row.abnummer),
    customerNumber: text(row.customerNumber ?? row.KDNR ?? row.kdnr),
    customerName: text(row.customerName ?? row.KUNDE ?? row.kunde),
    customerAddress,
    commission: text(row.commission ?? row.KOMMISSION ?? row.kommission),
    deliveryAddress,
    deliveryCountry: deliveryParts.country,
    deliveryPostalCode: deliveryParts.postalCode,
    deliveryStreet: deliveryParts.street,
    deliveryCity: deliveryParts.city,
    deliveryDate: dateText(row.deliveryDate ?? row.LIEFERTERMIN ?? row.liefertermin),
    sourcePhone: text(row.sourcePhone ?? row.KAPA_TELEFON ?? row.kapa_telefon),
    sourceEmail: text(row.sourceEmail ?? row.KAPA_EMAIL ?? row.kapa_email),
    tour: text(row.tour ?? row.KAPA_TOUR ?? row.kapa_tour ?? row.TOUR ?? row.tour),
    shippingEh: text(row.shippingEh ?? row.VERSAND_EH ?? row.versand_eh),
    elementWeight: text(row.elementWeight ?? row.GEWICHT_ELEMENTE ?? row.gewicht_elemente),
    blrCount: text(row.blrCount ?? row.ANZ_BLR ?? row.anz_blr),
    eprodStorageLocation: text(row.eprodStorageLocation ?? row.EPROD_LAGERPLATZ ?? row.eprod_lagerplatz),
    handles: text(row.handles ?? row.GRIFFE ?? row.griffe),
    maxWidth: text(row.maxWidth ?? row.MAXBREITE ?? row.maxbreite),
    maxHeight: text(row.maxHeight ?? row.MAXHOEHE ?? row.maxhoehe),
    shippingUnits: text(row.shippingUnits ?? row.VERSANDEINHEITEN ?? row.versandeinheiten),
    origin,
    canDelete
  };
}

function mergeOrder(order, avis, driverMap) {
  const driver = avis?.driverPhoneId ? driverMap.get(avis.driverPhoneId) : null;
  const displayDeliveryDate = avis?.deliveryDate || order.deliveryDate;
  const displayDeliveryAddress = avis?.deliveryAddress || order.deliveryAddress;
  const displayEprodStorageLocation = avis?.eprodStorageLocation || order.eprodStorageLocation;
  const displayDeliveryParts = avis?.deliveryAddress
    ? splitDeliveryAddress(displayDeliveryAddress)
    : splitDeliveryAddress(displayDeliveryAddress, {
      country: order.deliveryCountry,
      postalCode: order.deliveryPostalCode,
      street: order.deliveryStreet,
      city: order.deliveryCity
    });

  return {
    ...order,
    deliveryAddress: displayDeliveryAddress,
    deliveryCountry: displayDeliveryParts.country,
    deliveryPostalCode: displayDeliveryParts.postalCode,
    deliveryStreet: displayDeliveryParts.street,
    deliveryCity: displayDeliveryParts.city,
    eprodStorageLocation: displayEprodStorageLocation,
    sourceDeliveryAddress: order.deliveryAddress,
    displayDeliveryDate,
    displayDeliveryWeek: isoWeekText(displayDeliveryDate),
    displayTour: order.tour,
    avis: {
      deliveryDate: avis?.deliveryDate || "",
      deliveryAddress: avis?.deliveryAddress || "",
      eprodStorageLocation: avis?.eprodStorageLocation || "",
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
      routeSequence: Number(avis?.routeSequence) || 0,
      routeSequenceUpdatedAt: avis?.routeSequenceUpdatedAt || "",
      routeSequenceUpdatedBy: avis?.routeSequenceUpdatedBy || "",
      ptvExportTags: Array.isArray(avis?.ptvExportTags) ? avis.ptvExportTags : [],
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
    smtpVerifyCertificate: Boolean(settings.smtpVerifyCertificate),
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
    tour: String(query.tour || "").trim(),
    driverPhoneId: String(query.driverPhoneId || "").trim()
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

  if (filters.driverPhoneId) {
    result = result.filter((order) => orderMatchesDriverPhoneFilter(order, filters.driverPhoneId));
  }

  return result;
}

function orderMatchesDriverPhoneFilter(order, driverPhoneId) {
  if (driverPhoneId === "__assigned") {
    return Boolean(order.avis.driverPhoneId);
  }

  if (driverPhoneId === "__missing") {
    return !order.avis.driverPhoneId;
  }

  return order.avis.driverPhoneId === driverPhoneId;
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
    order.deliveryCountry,
    order.deliveryPostalCode,
    order.deliveryStreet,
    order.deliveryCity,
    order.tour,
    order.sourcePhone,
    order.sourceEmail,
    order.shippingEh,
    order.elementWeight,
    order.blrCount,
    order.eprodStorageLocation,
    order.handles,
    order.maxWidth,
    order.maxHeight,
    order.shippingUnits,
    order.avis.twoDayTour ? "2-Tagestour" : ""
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

function sanitizeAvisUpdate(input) {
  const update = {};

  if (Object.hasOwn(input, "deliveryDate")) {
    update.deliveryDate = dateText(input.deliveryDate);
  }

  if (Object.hasOwn(input, "deliveryAddress")) {
    update.deliveryAddress = text(input.deliveryAddress);
  }

  if (Object.hasOwn(input, "eprodStorageLocation")) {
    update.eprodStorageLocation = text(input.eprodStorageLocation);
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
    throw new Error("Keine Aufträge für die Massenbearbeitung ausgewählt.");
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
  } else if (input.notified === false) {
    values.notified = false;
  }

  if (Object.keys(values).length === 0) {
    throw new Error("Keine Änderung für die Massenbearbeitung ausgewählt.");
  }

  return {
    orderNumbers: [...new Set(orderNumbers)],
    values
  };
}

function sanitizeOrderNumbers(input) {
  if (!Array.isArray(input)) {
    throw new Error("Keine Aufträge übergeben.");
  }

  const orderNumbers = [...new Set(input.map((orderNumber) => text(orderNumber)).filter(Boolean))];

  if (orderNumbers.length === 0) {
    throw new Error("Keine Aufträge für die Reihenfolge gefunden.");
  }

  return orderNumbers;
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
    "userGroupDn",
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

  if (Object.hasOwn(input, "sendDelaySeconds")) {
    settings.sendDelaySeconds = Math.max(0, number(input.sendDelaySeconds, 0));
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

function sanitizePtvSettings(input) {
  return {
    login: text(input.login),
    password: text(input.password),
    exportUrl: text(input.exportUrl),
    plantCountry: text(input.plantCountry) || "DE",
    plantPostalCode: text(input.plantPostalCode) || "94154",
    plantCity: text(input.plantCity) || "Neukirchen v. W.",
    plantStreet: text(input.plantStreet) || "Gewerbepark 7",
    plantEndCountry: text(input.plantEndCountry) || text(input.plantCountry) || "DE",
    plantEndPostalCode: text(input.plantEndPostalCode) || text(input.plantPostalCode) || "94154",
    plantEndCity: text(input.plantEndCity) || text(input.plantCity) || "Neukirchen v. W.",
    plantEndStreet: text(input.plantEndStreet) || text(input.plantStreet) || "Gewerbepark 7",
    stopPauseMinutes: Math.max(0, number(input.stopPauseMinutes, 20)),
    optimizeOnUpload: Boolean(input.optimizeOnUpload)
  };
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
    smtpVerifyCertificate: Boolean(settings.smtpVerifyCertificate),
    sendDelaySeconds: Math.max(0, number(settings.sendDelaySeconds, 0)),
    smtpUser: settings.smtpUser || "",
    smtpPassword: settings.smtpPassword || "",
    fromName: settings.fromName || "",
    fromEmail: settings.fromEmail || "",
    replyTo: settings.replyTo || "",
    demoMode: settings.demoMode !== false,
    demoRecipients: settings.demoRecipients || ""
  };
}

function publicPtvSettings(settings) {
  return {
    login: settings.login || "",
    password: settings.password || "",
    exportUrl: settings.exportUrl || "",
    plantCountry: settings.plantCountry || "DE",
    plantPostalCode: settings.plantPostalCode || "94154",
    plantCity: settings.plantCity || "Neukirchen v. W.",
    plantStreet: settings.plantStreet || "Gewerbepark 7",
    plantEndCountry: settings.plantEndCountry || settings.plantCountry || "DE",
    plantEndPostalCode: settings.plantEndPostalCode || settings.plantPostalCode || "94154",
    plantEndCity: settings.plantEndCity || settings.plantCity || "Neukirchen v. W.",
    plantEndStreet: settings.plantEndStreet || settings.plantStreet || "Gewerbepark 7",
    stopPauseMinutes: Math.max(0, number(settings.stopPauseMinutes, 20)),
    optimizeOnUpload: Boolean(settings.optimizeOnUpload),
    updatedAt: settings.updatedAt || "",
    updatedBy: settings.updatedBy || ""
  };
}

function buildPtvRemoteUrl(settings, orderNumbers, orders, exportEntry = null) {
  const login = text(settings.login);
  const password = text(settings.password);

  if (!login || !password) {
    throw new Error("PTV Login und Passwort fehlen in den Stammdaten.");
  }

  const orderMap = new Map(orders.map((order) => [order.orderNumber, order]));
  const selectedOrders = orderNumbers.map((orderNumber) => orderMap.get(orderNumber)).filter(Boolean);

  if (selectedOrders.length === 0) {
    throw new Error("Keine passenden Aufträge für PTV gefunden.");
  }

  const invalidStations = selectedOrders
    .map((order, index) => validatePtvOrderStation(order, index + 2))
    .filter(Boolean);

  if (invalidStations.length) {
    throw new Error(`PTV kann nicht geöffnet werden. Bitte Lieferadresse prüfen: ${invalidStations.join("; ")}`);
  }

  const params = new URLSearchParams({
    login,
    password,
    language: "DE",
    remotetype: "routing",
    action: settings.optimizeOnUpload ? "routing" : "in_stationlist",
    clearlist: "1",
    ticketid: exportEntry?.id || selectedOrders[0].orderNumber,
    num_stations: String(selectedOrders.length + 2)
  });
  const exportUrl = ptvCallbackUrl(settings.exportUrl);

  if (exportUrl) {
    params.set("exportmode", "0");
    params.set("exporturl", exportUrl);
    params.set("exportformat", "json");
  }

  params.set("s1", ptvRemotePlantStation(settings));

  selectedOrders.forEach((order, index) => {
    params.set(`s${index + 2}`, ptvRemoteStation(order, settings));
  });

  params.set(`s${selectedOrders.length + 2}`, ptvRemotePlantEndStation(settings));

  const url = `https://mginter.mapandguide.com/v7.10/remote/remote_control.html?${params.toString()}`;
  const warnings = [];

  if (url.length > 32768) {
    warnings.push("Der PTV-Link ist länger als 32.768 Zeichen. Bitte weniger Aufträge auswählen oder CSV verwenden.");
  }

  return {
    url,
    length: url.length,
    ticketid: exportEntry?.id || selectedOrders[0].orderNumber,
    export: exportEntry,
    warnings
  };
}

function ptvRemotePlantStation(settings) {
  const street = splitStreetAndHouseNumber(settings.plantStreet || "Gewerbepark 7");
  const fields = [
    "places",
    "town",
    ptvCountryCode(settings.plantCountry, settings.plantPostalCode) || "DE",
    settings.plantPostalCode || "94154",
    settings.plantCity || "Neukirchen v. W.",
    "",
    street.street,
    street.houseNumber,
    "WERK",
    "Werksstandort",
    "",
    "",
    "00:00",
    "00:00",
    "0",
    "00:00",
    "0",
    "Bayerwald"
  ];

  return fields.map((field) => String(field || "").replaceAll("|", " ")).join("|");
}

function ptvRemotePlantEndStation(settings) {
  const street = splitStreetAndHouseNumber(settings.plantEndStreet || settings.plantStreet || "Gewerbepark 7");
  const fields = [
    "places",
    "town",
    ptvCountryCode(settings.plantEndCountry || settings.plantCountry, settings.plantEndPostalCode || settings.plantPostalCode) || "DE",
    settings.plantEndPostalCode || settings.plantPostalCode || "94154",
    settings.plantEndCity || settings.plantCity || "Neukirchen v. W.",
    "",
    street.street,
    street.houseNumber,
    "WERK_ENDE",
    "Rückkehr Werk",
    "",
    "",
    "00:00",
    "00:00",
    "0",
    "00:00",
    "0",
    "Bayerwald Rückkehr"
  ];

  return fields.map((field) => String(field || "").replaceAll("|", " ")).join("|");
}

function ptvRemoteStation(order, settings) {
  const street = splitStreetAndHouseNumber(order.deliveryStreet || order.deliveryAddress);
  const stopPause = ptvPauseTime(settings.stopPauseMinutes);
  const fields = [
    "places",
    "town",
    ptvCountryCode(order.deliveryCountry, order.deliveryPostalCode) || "DE",
    order.deliveryPostalCode || "",
    order.deliveryCity || "",
    "",
    street.street,
    street.houseNumber,
    order.orderNumber,
    ptvRemoteComment(order),
    "",
    "",
    "00:00",
    "00:00",
    "0",
    stopPause,
    "0",
    [order.orderNumber, order.customerName].filter(Boolean).join(" ")
  ];

  return fields.map((field) => String(field || "").replaceAll("|", " ")).join("|");
}

function validatePtvOrderStation(order, stationNumber) {
  const street = splitStreetAndHouseNumber(order.deliveryStreet || order.deliveryAddress);
  const missing = [];

  if (!ptvCountryCode(order.deliveryCountry, order.deliveryPostalCode)) {
    missing.push("Land");
  }

  if (!text(order.deliveryPostalCode)) {
    missing.push("PLZ");
  }

  if (!text(order.deliveryCity)) {
    missing.push("Ort");
  }

  if (!text(street.street)) {
    missing.push("Straße");
  }

  if (missing.length) {
    return `Station ${stationNumber} / Auftrag ${order.orderNumber}: ${missing.join(", ")} fehlt`;
  }

  return "";
}

function ptvCountryCode(country, postalCode = "") {
  const value = text(country).toUpperCase();
  const aliases = {
    D: "DE",
    A: "AT",
    H: "HU",
    I: "IT"
  };

  return aliases[value] || value || inferCountryFromPostalCode(postalCode);
}

function ptvRemoteComment(order) {
  return [
    `Auftrag ${order.orderNumber}`,
    order.tour || "",
    order.eprodStorageLocation ? `Stellplatz ${order.eprodStorageLocation}` : ""
  ].filter(Boolean).join(" / ");
}

function ptvPauseTime(minutes) {
  const totalMinutes = Math.max(0, Math.round(number(minutes, 20)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}

async function importPtvCallback(input) {
  const ticketid = text(input.ticketid);
  const data = text(input.data);
  const knownOrderNumbers = await listKnownOrderNumbers();
  const ptvRoute = extractPtvRoute(data, knownOrderNumbers);
  const orderNumbers = ptvRoute.orderNumbers.length
    ? ptvRoute.orderNumbers
    : extractPtvOrderNumbers(data, knownOrderNumbers);
  const status = orderNumbers.length > 0 ? "imported" : "received";
  const message = orderNumbers.length > 0
    ? `${orderNumbers.length} Aufträge aus PTV-Rückgabe erkannt.`
    : "PTV-Rückgabe gespeichert, aber keine bekannte Auftragsnummer erkannt.";

  if (orderNumbers.length > 0) {
    await store.updateRouteSequence(orderNumbers, {
      id: "",
      username: "ptv-callback",
      displayName: "PTV Rückgabe"
    }, ptvRoute.routeInfos);

    await store.optimizePtvExport(ticketid, orderNumbers, {
      id: "",
      username: "ptv-callback",
      displayName: "PTV Rückgabe"
    }, ptvRoute.routeInfos);
  }

  await store.appendPtvCallback({
    ticketid,
    status,
    message,
    orderNumbers,
    routeInfoCount: Object.keys(ptvRoute.routeInfos).length,
    dataPreview: data.slice(0, 4000),
    data: data.slice(0, 20000)
  });

  return {
    ticketid,
    status,
    message,
    orderNumbers,
    routeInfoCount: Object.keys(ptvRoute.routeInfos).length
  };
}

function readPtvCallbackPayload(request) {
  const queryTicketId = text(request.query?.ticketid || request.query?.ticketId);
  const queryData = text(request.query?.data);

  if (typeof request.body === "string") {
    const parsed = parsePtvCallbackText(request.body);

    return {
      ticketid: queryTicketId || parsed.ticketid,
      data: queryData || parsed.data || request.body
    };
  }

  if (request.body && typeof request.body === "object") {
    return {
      ticketid: queryTicketId || text(request.body.ticketid || request.body.ticketId),
      data: queryData || normalizePtvCallbackData(request.body.data ?? request.body.Data ?? request.body)
    };
  }

  return {
    ticketid: queryTicketId,
    data: queryData
  };
}

function parsePtvCallbackText(value) {
  const input = text(value);

  try {
    const params = new URLSearchParams(input);
    const data = text(params.get("data"));
    const ticketid = text(params.get("ticketid") || params.get("ticketId"));

    if (data || ticketid) {
      return {
        ticketid,
        data
      };
    }
  } catch {
    // Plain JSON/XML/text is handled by returning the raw body below.
  }

  return {
    ticketid: "",
    data: input
  };
}

function normalizePtvCallbackData(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function extractPtvOrderNumbers(data, knownOrderNumbers) {
  const result = [];
  const known = new Set([...knownOrderNumbers].map((orderNumber) => String(orderNumber || "").trim()).filter(Boolean));

  if (known.size === 0 || !data) {
    return result;
  }

  try {
    collectPtvOrderNumbers(JSON.parse(data), known, result);
  } catch {
    // PTV may return form encoded strings or formatted text. The raw scan below covers that.
  }

  if (result.length > 0) {
    return uniqueInOrder(result);
  }

  return [...known]
    .map((orderNumber) => ({
      orderNumber,
      index: data.indexOf(orderNumber)
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.orderNumber);
}

function extractPtvRoute(data, knownOrderNumbers) {
  const known = new Set([...knownOrderNumbers].map((orderNumber) => String(orderNumber || "").trim()).filter(Boolean));

  if (known.size === 0 || !data) {
    return emptyPtvRoute();
  }

  try {
    return collectPtvRoute(JSON.parse(data), known);
  } catch {
    return emptyPtvRoute();
  }
}

function collectPtvRoute(payload, knownOrderNumbers) {
  const routes = Array.isArray(payload?.routes) ? payload.routes : [];
  const orderNumbers = [];
  const routeInfos = {};

  for (const route of routes) {
    const items = Array.isArray(route?.itineraryItems) ? route.itineraryItems : [];
    const routeStartSeconds = firstRouteStartSeconds(items);

    for (const item of items) {
      if (!isPtvStopOff(item)) {
        continue;
      }

      const orderNumber = ptvOrderNumberFromStop(item, knownOrderNumbers);

      if (!orderNumber || routeInfos[orderNumber]) {
        continue;
      }

      orderNumbers.push(orderNumber);
      routeInfos[orderNumber] = ptvRouteInfoFromStop(item, routeStartSeconds);
    }
  }

  return {
    orderNumbers: uniqueInOrder(orderNumbers),
    routeInfos
  };
}

function emptyPtvRoute() {
  return {
    orderNumbers: [],
    routeInfos: {}
  };
}

function firstRouteStartSeconds(items) {
  const first = items.find((item) => Number.isFinite(Number(item?.timeStamp)));
  return Number(first?.timeStamp) || 0;
}

function isPtvStopOff(item) {
  return item && typeof item === "object" && (item.detailLevel === "STOP_OFF" || Array.isArray(item.stationTourInfo));
}

function ptvOrderNumberFromStop(item, knownOrderNumbers) {
  const candidates = [
    item.ticketid,
    item.ticketId,
    item.id,
    item.name,
    item.comment,
    item.desc
  ].map((value) => text(value)).filter(Boolean);

  for (const value of candidates) {
    if (knownOrderNumbers.has(value)) {
      return value;
    }

    for (const orderNumber of knownOrderNumbers) {
      if (value.includes(orderNumber)) {
        return orderNumber;
      }
    }
  }

  return "";
}

function ptvRouteInfoFromStop(item, routeStartSeconds) {
  const stationInfo = Array.isArray(item.stationTourInfo) ? item.stationTourInfo[0] || {} : {};
  const itemTimestamp = Number(item.timeStamp);
  const stopStartSeconds = Number.isFinite(itemTimestamp) ? itemTimestamp : routeStartSeconds;

  return {
    arrivalAt: ptvIsoTime(itemTimestamp, 0) || ptvIsoTime(stationInfo.arrivalTime, routeStartSeconds),
    serviceStartAt: ptvIsoTime(stationInfo.startOfService, routeStartSeconds),
    serviceEndAt: ptvIsoTime(stationInfo.endOfService, routeStartSeconds),
    departureAt: ptvIsoTime(stationInfo.departureTime, routeStartSeconds)
      || ptvIsoTime(stationInfo.endOfService, routeStartSeconds)
      || ptvRelativeIsoTime(stationInfo.period, stopStartSeconds)
      || ptvIsoTime(itemTimestamp, 0),
    travelTimeSeconds: safeNumber(item.travelTime),
    legTravelTimeSeconds: safeNumber(item.differentialTravelTime),
    distanceMeters: safeNumber(item.distance),
    legDistanceMeters: safeNumber(item.differentialDistance),
    stopOffIndex: safeNumber(item.stopOffIndex),
    source: "ptv"
  };
}

function ptvRelativeIsoTime(value, baseSeconds) {
  const seconds = Number(value);
  const base = Number(baseSeconds);

  if (!Number.isFinite(seconds) || !Number.isFinite(base) || base <= 0) {
    return "";
  }

  return new Date((base + seconds) * 1000).toISOString();
}

function ptvIsoTime(value, routeStartSeconds) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return "";
  }

  const absoluteSeconds = seconds > 1000000000
    ? seconds
    : Number(routeStartSeconds) + seconds;

  if (!Number.isFinite(absoluteSeconds) || absoluteSeconds <= 0) {
    return "";
  }

  return new Date(absoluteSeconds * 1000).toISOString();
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectPtvOrderNumbers(value, knownOrderNumbers, result) {
  if (typeof value === "string" || typeof value === "number") {
    addKnownPtvOrderNumber(String(value), knownOrderNumbers, result);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPtvOrderNumbers(item, knownOrderNumbers, result));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const priorityKeys = ["ticketid", "ticketId", "id", "iD", "name", "comment", "desc"];

  for (const key of priorityKeys) {
    if (Object.hasOwn(value, key)) {
      collectPtvOrderNumbers(value[key], knownOrderNumbers, result);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (!priorityKeys.includes(key)) {
      collectPtvOrderNumbers(child, knownOrderNumbers, result);
    }
  }
}

function addKnownPtvOrderNumber(value, knownOrderNumbers, result) {
  const trimmed = value.trim();

  if (knownOrderNumbers.has(trimmed)) {
    result.push(trimmed);
    return;
  }

  for (const orderNumber of knownOrderNumbers) {
    if (trimmed.includes(orderNumber)) {
      result.push(orderNumber);
    }
  }
}

function uniqueInOrder(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function ptvCallbackUrl(value) {
  const input = text(value);

  if (!input) {
    return "";
  }

  try {
    const url = new URL(input);

    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/api/ptv/callback";
    }

    return url.toString();
  } catch {
    return input;
  }
}

function startHttpsServer() {
  if (!config.https.enabled) {
    return;
  }

  try {
    const options = loadHttpsOptions();
    https.createServer(options, app).listen(config.https.port, () => {
      console.log(`AVIS HTTPS listening on port ${config.https.port}`);
    });
  } catch (error) {
    console.error(`AVIS HTTPS not started: ${error.message}`);
  }
}

function loadHttpsOptions() {
  const cert = config.https.cert || readExistingFile(config.https.certFile);
  const key = config.https.key || readExistingFile(config.https.keyFile);

  if (cert && key) {
    return {
      cert,
      key
    };
  }

  if (!config.https.autoSelfSigned) {
    throw new Error("AVIS_HTTPS_CERT_FILE und AVIS_HTTPS_KEY_FILE fehlen.");
  }

  return createOrReadSelfSignedCertificate();
}

function createOrReadSelfSignedCertificate() {
  const certDir = path.join(path.dirname(config.dataFile), "certs");
  const certFile = path.join(certDir, "avis-selfsigned.crt");
  const keyFile = path.join(certDir, "avis-selfsigned.key");

  fs.mkdirSync(certDir, { recursive: true });

  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "3650",
      "-subj",
      `/CN=${config.https.hostname}`,
      "-addext",
      `subjectAltName=DNS:${config.https.hostname},IP:127.0.0.1`
    ], {
      stdio: "ignore"
    });

    console.log(`AVIS HTTPS self-signed certificate created for ${config.https.hostname}.`);
  }

  return {
    cert: fs.readFileSync(certFile, "utf8"),
    key: fs.readFileSync(keyFile, "utf8")
  };
}

function readExistingFile(filePath) {
  const input = text(filePath);

  if (!input || !fs.existsSync(input)) {
    return "";
  }

  return fs.readFileSync(input, "utf8");
}

function splitStreetAndHouseNumber(value) {
  const input = text(value);
  const match = input.match(/^(.*?)(\s+\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/);

  if (!match) {
    return {
      street: input,
      houseNumber: ""
    };
  }

  return {
    street: match[1].trim(),
    houseNumber: match[2].trim()
  };
}

function sanitizeLocalOrder(input, origin) {
  const customerAddress = text(input.customerAddress ?? input.KUNDE_ANSCHRIFT);
  const deliveryAddress = text(input.deliveryAddress ?? input.KAPA_LIEFERANSCHRIFT)
    || formatDeliveryAddress({
      postalCode: input.deliveryPostalCode ?? input.KAPA_LIEFER_PLZ,
      street: input.deliveryStreet ?? input.KAPA_LIEFER_STRASSE,
      city: input.deliveryCity ?? input.KAPA_LIEFER_ORT
    });
  const deliveryParts = splitDeliveryAddress(deliveryAddress, {
    country: input.deliveryCountry ?? input.KAPA_LIEFER_LAND ?? countryFromAddressPrefix(customerAddress),
    postalCode: input.deliveryPostalCode ?? input.KAPA_LIEFER_PLZ,
    street: input.deliveryStreet ?? input.KAPA_LIEFER_STRASSE,
    city: input.deliveryCity ?? input.KAPA_LIEFER_ORT
  });

  return {
    orderNumber: normalizeRequiredText(input.orderNumber ?? input.ABNUMMER, "Auftragsnummer"),
    customerNumber: text(input.customerNumber ?? input.KDNR),
    customerName: text(input.customerName ?? input.KUNDE),
    customerAddress,
    commission: text(input.commission ?? input.KOMMISSION),
    deliveryAddress,
    deliveryCountry: deliveryParts.country,
    deliveryPostalCode: deliveryParts.postalCode,
    deliveryStreet: deliveryParts.street,
    deliveryCity: deliveryParts.city,
    deliveryDate: dateText(input.deliveryDate ?? input.LIEFERTERMIN),
    sourcePhone: text(input.sourcePhone ?? input.KAPA_TELEFON),
    sourceEmail: text(input.sourceEmail ?? input.KAPA_EMAIL),
    tour: text(input.tour ?? input.KAPA_TOUR ?? input.TOUR),
    shippingEh: text(input.shippingEh ?? input.VERSAND_EH),
    elementWeight: text(input.elementWeight ?? input.GEWICHT_ELEMENTE),
    blrCount: text(input.blrCount ?? input.ANZ_BLR),
    eprodStorageLocation: text(input.eprodStorageLocation ?? input.EPROD_LAGERPLATZ),
    handles: text(input.handles ?? input.GRIFFE),
    maxWidth: text(input.maxWidth ?? input.MAXBREITE),
    maxHeight: text(input.maxHeight ?? input.MAXHOEHE),
    shippingUnits: text(input.shippingUnits ?? input.VERSANDEINHEITEN),
    origin
  };
}

function formatDeliveryAddress(parts) {
  return [
    text(parts.postalCode),
    text(parts.street),
    text(parts.city)
  ].filter(Boolean).join(" ");
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

function sanitizeUserPreferences(input) {
  const theme = text(input.theme);

  if (!["light", "dark", "system"].includes(theme)) {
    throw new Error("Ungültiges Design.");
  }

  return { theme };
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
      message: "Nur Admins dürfen diesen Bereich nutzen."
    });
    return;
  }

  next();
}

function requireFullAdmin(request, response, next) {
  if (!isFullAdminRole(request.user)) {
    response.status(403).json({
      error: "ADMIN_REQUIRED",
      message: "Nur Admins dürfen diesen Bereich nutzen."
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

function splitDeliveryAddress(address, parts = {}) {
  const provided = {
    country: text(parts.country),
    postalCode: text(parts.postalCode),
    street: text(parts.street),
    city: text(parts.city)
  };

  if (provided.postalCode || provided.street || provided.city) {
    return {
      country: normalizeCountryCode(provided.country) || inferCountryFromPostalCode(provided.postalCode),
      postalCode: provided.postalCode,
      street: provided.street,
      city: provided.city
    };
  }

  const value = text(address).replace(/\s+/g, " ");
  const match = value.match(/^(?:(?<country>[A-Z]{1,3})[-\s]+)?(?<postalCode>\d{4,6})\s+(?<rest>.+)$/i);

  if (!match?.groups) {
    return {
      country: provided.country || "",
      postalCode: "",
      street: value,
      city: ""
    };
  }

  const postalCode = match.groups.postalCode;
  const rest = text(match.groups.rest);
  const commaParts = rest.split(",").map((part) => text(part)).filter(Boolean);
  let street = "";
  let city = "";

  if (commaParts.length >= 2) {
    street = commaParts.at(-1);
    city = commaParts.slice(0, -1).join(", ");
  } else {
    const houseNumberMatch = [...rest.matchAll(/\b\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?\b/g)].at(-1);

    if (houseNumberMatch) {
      const splitIndex = houseNumberMatch.index + houseNumberMatch[0].length;
      street = text(rest.slice(0, splitIndex));
      city = text(rest.slice(splitIndex));
    } else {
      street = rest;
    }
  }

  return {
    country: normalizeCountryCode(match.groups.country) || normalizeCountryCode(provided.country) || inferCountryFromPostalCode(postalCode),
    postalCode,
    street,
    city
  };
}

function normalizeCountryCode(country) {
  const value = text(country).toUpperCase();
  const aliases = {
    A: "AT",
    D: "DE",
    H: "HU",
    I: "IT"
  };

  return aliases[value] || value;
}

function inferCountryFromPostalCode(postalCode) {
  const value = text(postalCode);

  if (/^\d{4}$/.test(value)) {
    return "AT";
  }

  if (/^\d{5}$/.test(value)) {
    return "DE";
  }

  return "";
}

function countryFromAddressPrefix(address) {
  const match = text(address).match(/^([A-Z]{1,3})[-\s]/i);
  return match ? normalizeCountryCode(match[1]) : "";
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
