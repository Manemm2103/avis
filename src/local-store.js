import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = {
  version: 1,
  users: [],
  sessions: {},
  driverPhones: [],
  avisByOrder: {},
  localOrders: [],
  sqlSettings: {
    ordersQuery: "",
    toursQuery: "",
    updatedAt: "",
    updatedBy: ""
  },
  ldapSettings: {
    enabled: false,
    name: "",
    host: "",
    port: 636,
    verifyCertificate: true,
    certificate: "",
    bindDn: "",
    bindPassword: "",
    baseDn: "",
    userFilter: "(objectClass=*)",
    loginAttribute: "sAMAccountName",
    userGroupDn: "",
    adminGroupDn: "",
    departmentLeadGroupDn: "",
    updatedAt: "",
    updatedBy: ""
  },
  mailSettings: {
    subject: "Avisierung Auftrag {{auftrag}}",
    body: `Guten Tag,

Ihr Auftrag {{auftrag}} ist fuer den {{liefertag}} eingeplant.

Kunde: {{kunde}}
Kommission: {{kommission}}
Lieferanschrift: {{lieferanschrift}}
Tour: {{tour}}
Fahrertelefon: {{fahrertelefon}}

{{info_fuer_kunden}}

Mit freundlichen Gruessen
Bayerwald Fenster und Tueren`,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    smtpVerifyCertificate: false,
    smtpUser: "",
    smtpPassword: "",
    fromName: "Bayerwald Fenster und Tueren",
    fromEmail: "",
    replyTo: "",
    demoMode: true,
    demoRecipients: "",
    updatedAt: "",
    updatedBy: ""
  },
  ptvSettings: {
    login: "",
    password: "",
    exportUrl: "",
    plantCountry: "DE",
    plantPostalCode: "94154",
    plantCity: "Neukirchen v. W.",
    plantStreet: "Gewerbepark 7",
    updatedAt: "",
    updatedBy: ""
  },
  ptvCallbacks: [],
  ptvExports: []
};

const ROLE_USER = "user";
const ROLE_ADMIN = "admin";
const ROLE_SUPERUSER = "superuser";

export class LocalStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = structuredClone(EMPTY_STATE);
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      this.state = {
        ...structuredClone(EMPTY_STATE),
        ...JSON.parse(content)
      };
      this.migrateState();
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      await this.save();
    }
  }

  migrateState() {
    this.state.users ||= [];
    this.state.sessions ||= {};
    this.state.driverPhones ||= [];
    this.state.avisByOrder ||= {};
    this.state.localOrders ||= [];
    this.state.sqlSettings ||= {
      ordersQuery: "",
      toursQuery: "",
      updatedAt: "",
      updatedBy: ""
    };
    this.state.ldapSettings = {
      ...structuredClone(EMPTY_STATE.ldapSettings),
      ...(this.state.ldapSettings || {})
    };
    this.state.mailSettings = {
      ...structuredClone(EMPTY_STATE.mailSettings),
      ...(this.state.mailSettings || {})
    };
    this.state.ptvSettings = {
      ...structuredClone(EMPTY_STATE.ptvSettings),
      ...(this.state.ptvSettings || {})
    };
    this.state.ptvCallbacks ||= [];
    this.state.ptvExports ||= [];

    for (const avis of Object.values(this.state.avisByOrder)) {
      avis.log ||= [];
      avis.mailLog ||= [];
    }
  }

  async ensureDefaultUser(username, password) {
    const normalizedUsername = username.trim().toLowerCase();

    if (this.state.users.length > 0) {
      const defaultUser = this.state.users.find((user) => user.username.toLowerCase() === normalizedUsername);

      if (defaultUser && defaultUser.role === ROLE_SUPERUSER) {
        defaultUser.role = ROLE_ADMIN;
        defaultUser.updatedAt = new Date().toISOString();
        await this.save();
      }

      return null;
    }

    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      displayName: username,
      role: ROLE_ADMIN,
      active: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.users.push(user);
    await this.save();
    return publicUser(user);
  }

  async resetDefaultAdminPassword(username, password) {
    const normalizedUsername = username.trim().toLowerCase();
    const now = new Date().toISOString();
    const existing = this.state.users.find((user) => user.username.toLowerCase() === normalizedUsername);

    if (existing) {
      existing.role = ROLE_ADMIN;
      existing.active = true;
      existing.passwordHash = hashPassword(password);
      existing.authProvider = "local";
      existing.updatedAt = now;
      existing.updatedBy = "ENV";
      await this.save();
      return publicUser(existing);
    }

    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      displayName: username,
      role: ROLE_ADMIN,
      active: true,
      authProvider: "local",
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      updatedBy: "ENV"
    };

    this.state.users.push(user);
    await this.save();
    return publicUser(user);
  }

  async listUsers() {
    return this.state.users.map(publicUser).sort((a, b) => a.username.localeCompare(b.username, "de"));
  }

  async createUser(input, actor) {
    const username = input.username.trim().toLowerCase();

    if (this.state.users.some((user) => user.username.toLowerCase() === username)) {
      throw new Error("Benutzername ist bereits vergeben.");
    }

    this.ensureActorMayWriteUser(input, null, actor);

    const user = {
      id: crypto.randomUUID(),
      username,
      displayName: input.displayName.trim() || username,
      role: input.role || ROLE_USER,
      active: input.active !== false,
      theme: normalizeTheme(input.theme),
      passwordHash: hashPassword(input.password),
      createdAt: new Date().toISOString(),
      createdBy: actor?.displayName || "",
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || ""
    };

    this.state.users.push(user);
    await this.save();
    return publicUser(user);
  }

  async updateUser(id, input, actor) {
    const index = this.state.users.findIndex((user) => user.id === id);

    if (index === -1) {
      throw new Error("Benutzer nicht gefunden.");
    }

    const next = {
      ...this.state.users[index],
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || ""
    };

    this.ensureActorMayWriteUser(input, this.state.users[index], actor);

    if (Object.hasOwn(input, "username")) {
      const username = input.username.trim().toLowerCase();

      if (this.state.users.some((user) => user.id !== id && user.username.toLowerCase() === username)) {
        throw new Error("Benutzername ist bereits vergeben.");
      }

      next.username = username;
    }

    if (Object.hasOwn(input, "displayName")) {
      next.displayName = input.displayName.trim() || next.username;
    }

    if (Object.hasOwn(input, "role")) {
      next.role = input.role || "user";
    }

    if (Object.hasOwn(input, "active")) {
      next.active = Boolean(input.active);
    }

    if (Object.hasOwn(input, "theme")) {
      next.theme = normalizeTheme(input.theme);
    }

    if (input.password) {
      next.passwordHash = hashPassword(input.password);
    }

    this.ensureAdminWouldRemain(next, id);
    this.state.users[index] = next;
    await this.save();
    return publicUser(next);
  }

  async login(username, password) {
    const normalizedUsername = username.trim().toLowerCase();
    const user = this.state.users.find((item) => item.username.toLowerCase() === normalizedUsername && item.active);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error("Benutzername oder Passwort ist falsch.");
    }

    return this.createSessionForUserId(user.id);
  }

  async createSessionForUserId(userId) {
    const user = this.state.users.find((item) => item.id === userId && item.active);

    if (!user) {
      throw new Error("Benutzer nicht gefunden oder inaktiv.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    this.state.sessions[token] = {
      userId: user.id,
      createdAt: now,
      lastSeenAt: now
    };

    await this.save();
    return {
      token,
      user: publicUser(user)
    };
  }

  async upsertLdapUser(input) {
    const username = input.username.trim().toLowerCase();
    const now = new Date().toISOString();
    const index = this.state.users.findIndex((user) => user.username.toLowerCase() === username);

    if (index === -1) {
      const user = {
        id: crypto.randomUUID(),
        username,
        displayName: input.displayName || username,
        email: input.email || "",
        role: input.role || ROLE_USER,
        active: true,
        authProvider: "ldap",
        theme: normalizeTheme(input.theme),
        passwordHash: "",
        createdAt: now,
        updatedAt: now,
        updatedBy: "LDAP"
      };

      this.state.users.push(user);
      await this.save();
      return publicUser(user);
    }

    const next = {
      ...this.state.users[index],
      displayName: input.displayName || this.state.users[index].displayName || username,
      email: input.email || this.state.users[index].email || "",
      role: input.role || this.state.users[index].role || ROLE_USER,
      active: true,
      authProvider: "ldap",
      updatedAt: now,
      updatedBy: "LDAP"
    };

    this.ensureAdminWouldRemain(next, this.state.users[index].id);
    this.state.users[index] = next;
    await this.save();
    return publicUser(next);
  }

  async updateUserPreferences(id, input, actor) {
    const index = this.state.users.findIndex((user) => user.id === id);

    if (index === -1) {
      throw new Error("Benutzer nicht gefunden.");
    }

    const next = {
      ...this.state.users[index],
      theme: normalizeTheme(input.theme),
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || actor?.username || ""
    };

    this.state.users[index] = next;
    await this.save();
    return publicUser(next);
  }

  getSession(token) {
    const session = this.state.sessions[token];

    if (!session) {
      return null;
    }

    const user = this.state.users.find((item) => item.id === session.userId && item.active);

    if (!user) {
      return null;
    }

    session.lastSeenAt = new Date().toISOString();
    return {
      session,
      user: publicUser(user)
    };
  }

  async logout(token) {
    delete this.state.sessions[token];
    await this.save();
  }

  getAvis(orderNumber) {
    return this.state.avisByOrder[orderNumber] || null;
  }

  async updateAvis(orderNumber, update, actor) {
    const current = this.state.avisByOrder[orderNumber] || {};
    const now = new Date().toISOString();
    const actorName = actor?.displayName || actor?.username || "Unbekannt";
    const isNotifying = update.notified === true && !current.notified;
    const isRevokingNotification = update.notified === false && current.notified;
    const next = {
      ...current,
      ...update,
      log: [...(current.log || [])],
      updatedAt: now,
      updatedBy: actorName,
      updatedByUserId: actor?.id || ""
    };

    next.log.push({
      id: crypto.randomUUID(),
      type: isNotifying ? "avisiert" : isRevokingNotification ? "avisierung_zurueckgenommen" : "gespeichert",
      at: now,
      by: actorName,
      byUserId: actor?.id || ""
    });

    if (isNotifying) {
      next.notifiedAt = now;
      next.notifiedBy = actorName;
      next.notifiedByUserId = actor?.id || "";
    }

    if (!next.notified) {
      next.notifiedAt = "";
      next.notifiedBy = "";
      next.notifiedByUserId = "";
    }

    this.state.avisByOrder[orderNumber] = next;
    await this.save();
    return next;
  }

  async updateRouteSequence(orderNumbers, actor) {
    const now = new Date().toISOString();
    const actorName = actor?.displayName || actor?.username || "Unbekannt";
    const uniqueOrderNumbers = [...new Set(orderNumbers.map((orderNumber) => String(orderNumber || "").trim()).filter(Boolean))];

    for (const [index, orderNumber] of uniqueOrderNumbers.entries()) {
      const current = this.state.avisByOrder[orderNumber] || {};
      const next = {
        ...current,
        routeSequence: index + 1,
        routeSequenceUpdatedAt: now,
        routeSequenceUpdatedBy: actorName,
        routeSequenceUpdatedByUserId: actor?.id || "",
        updatedAt: now,
        updatedBy: actorName,
        updatedByUserId: actor?.id || "",
        log: [...(current.log || [])]
      };

      next.log.push({
        id: crypto.randomUUID(),
        type: "ptv_reihenfolge",
        at: now,
        by: actorName,
        byUserId: actor?.id || ""
      });

      this.state.avisByOrder[orderNumber] = next;
    }

    await this.save();
    return {
      updated: uniqueOrderNumbers.length
    };
  }

  async appendAvisMail(orderNumber, mail, actor) {
    const current = this.state.avisByOrder[orderNumber] || {};
    const actorName = actor?.displayName || actor?.username || "Unbekannt";
    const entry = {
      id: crypto.randomUUID(),
      status: mail.status || "sent",
      sentAt: mail.sentAt || new Date().toISOString(),
      recipients: Array.isArray(mail.recipients) ? mail.recipients : [],
      subject: mail.subject || "",
      body: mail.body || "",
      from: mail.from || "",
      replyTo: mail.replyTo || "",
      messageId: mail.messageId || "",
      demoMode: Boolean(mail.demoMode),
      by: actorName,
      byUserId: actor?.id || ""
    };

    this.state.avisByOrder[orderNumber] = {
      ...current,
      mailLog: [
        ...(current.mailLog || []),
        entry
      ]
    };

    await this.save();
    return entry;
  }

  async listDriverPhones() {
    return [...this.state.driverPhones].sort((a, b) => a.label.localeCompare(b.label, "de"));
  }

  async createDriverPhone(input) {
    const driver = {
      id: crypto.randomUUID(),
      label: input.label,
      phone: input.phone,
      active: input.active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.driverPhones.push(driver);
    await this.save();
    return driver;
  }

  async updateDriverPhone(id, input) {
    const index = this.state.driverPhones.findIndex((driver) => driver.id === id);

    if (index === -1) {
      throw new Error("Fahrertelefon nicht gefunden.");
    }

    const next = {
      ...this.state.driverPhones[index],
      ...input,
      updatedAt: new Date().toISOString()
    };

    this.state.driverPhones[index] = next;
    await this.save();
    return next;
  }

  async deleteDriverPhone(id, actor) {
    const index = this.state.driverPhones.findIndex((driver) => driver.id === id);

    if (index === -1) {
      throw new Error("Fahrertelefon nicht gefunden.");
    }

    const [deleted] = this.state.driverPhones.splice(index, 1);
    const now = new Date().toISOString();
    const actorName = actor?.displayName || actor?.username || "Unbekannt";
    let clearedOrders = 0;

    for (const [orderNumber, avis] of Object.entries(this.state.avisByOrder)) {
      if (avis?.driverPhoneId !== id) {
        continue;
      }

      this.state.avisByOrder[orderNumber] = {
        ...avis,
        driverPhoneId: "",
        log: [
          ...(avis.log || []),
          {
            id: crypto.randomUUID(),
            type: "fahrertelefon_geloescht",
            at: now,
            by: actorName,
            byUserId: actor?.id || ""
          }
        ],
        updatedAt: now,
        updatedBy: actorName,
        updatedByUserId: actor?.id || ""
      };
      clearedOrders += 1;
    }

    await this.save();
    return {
      deleted,
      clearedOrders
    };
  }

  getSqlSettings(defaults = {}) {
    return {
      ordersQuery: this.state.sqlSettings.ordersQuery || defaults.ordersQuery || "",
      toursQuery: this.state.sqlSettings.toursQuery || defaults.toursQuery || "",
      updatedAt: this.state.sqlSettings.updatedAt || "",
      updatedBy: this.state.sqlSettings.updatedBy || ""
    };
  }

  async updateSqlSettings(input, actor) {
    this.state.sqlSettings = {
      ordersQuery: Object.hasOwn(input, "ordersQuery") ? input.ordersQuery : this.state.sqlSettings.ordersQuery || "",
      toursQuery: Object.hasOwn(input, "toursQuery") ? input.toursQuery : this.state.sqlSettings.toursQuery || "",
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || actor?.username || ""
    };

    await this.save();
    return this.getSqlSettings();
  }

  getLdapSettings() {
    return {
      ...structuredClone(EMPTY_STATE.ldapSettings),
      ...(this.state.ldapSettings || {})
    };
  }

  async updateLdapSettings(input, actor) {
    this.state.ldapSettings = {
      ...this.getLdapSettings(),
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || actor?.username || ""
    };

    await this.save();
    return this.getLdapSettings();
  }

  getMailSettings() {
    return {
      ...structuredClone(EMPTY_STATE.mailSettings),
      ...(this.state.mailSettings || {})
    };
  }

  async updateMailSettings(input, actor) {
    this.state.mailSettings = {
      ...this.getMailSettings(),
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || actor?.username || ""
    };

    await this.save();
    return this.getMailSettings();
  }

  getPtvSettings() {
    return {
      ...structuredClone(EMPTY_STATE.ptvSettings),
      ...(this.state.ptvSettings || {})
    };
  }

  async updatePtvSettings(input, actor) {
    this.state.ptvSettings = {
      ...this.getPtvSettings(),
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: actor?.displayName || actor?.username || ""
    };

    await this.save();
    return this.getPtvSettings();
  }

  listPtvCallbacks() {
    return [...(this.state.ptvCallbacks || [])]
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, 20);
  }

  async appendPtvCallback(input) {
    const entry = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ticketid: input.ticketid || "",
      status: input.status || "received",
      message: input.message || "",
      orderNumbers: Array.isArray(input.orderNumbers) ? input.orderNumbers : [],
      dataPreview: input.dataPreview || "",
      data: input.data || ""
    };

    this.state.ptvCallbacks = [
      entry,
      ...(this.state.ptvCallbacks || [])
    ].slice(0, 20);

    await this.save();
    return entry;
  }

  listPtvExports() {
    return [...(this.state.ptvExports || [])]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  getPtvExport(id) {
    return (this.state.ptvExports || []).find((item) => item.id === id) || null;
  }

  async createPtvExport(input, actor) {
    const now = new Date().toISOString();
    const orderNumbers = uniqueOrderNumbers(input.orderNumbers);
    const entry = {
      id: crypto.randomUUID(),
      name: String(input.name || "").trim() || `PTV Export ${new Date().toLocaleString("de-DE")}`,
      status: "exportiert",
      orderNumbers,
      optimizedOrderNumbers: [],
      createdAt: now,
      createdBy: actor?.displayName || actor?.username || "",
      updatedAt: now,
      updatedBy: actor?.displayName || actor?.username || ""
    };

    this.state.ptvExports.unshift(entry);
    await this.applyPtvExportTags(entry, actor, false);
    await this.save();
    return entry;
  }

  async optimizePtvExport(id, orderNumbers, actor) {
    const exportEntry = this.getPtvExport(id);

    if (!exportEntry) {
      return null;
    }

    exportEntry.status = "ptv_optimiert";
    exportEntry.optimizedOrderNumbers = uniqueOrderNumbers(orderNumbers);
    exportEntry.updatedAt = new Date().toISOString();
    exportEntry.updatedBy = actor?.displayName || actor?.username || "PTV Rueckgabe";

    await this.applyPtvExportTags(exportEntry, actor, true);
    await this.save();
    return exportEntry;
  }

  async applyPtvExportTags(exportEntry, actor, optimized) {
    const now = new Date().toISOString();
    const actorName = actor?.displayName || actor?.username || "PTV Rueckgabe";
    const orderNumbers = uniqueOrderNumbers([
      ...(exportEntry.orderNumbers || []),
      ...(exportEntry.optimizedOrderNumbers || [])
    ]);

    for (const orderNumber of orderNumbers) {
      const current = this.state.avisByOrder[orderNumber] || {};
      const exportTags = Array.isArray(current.ptvExportTags) ? [...current.ptvExportTags] : [];
      const tagIndex = exportTags.findIndex((tag) => tag.id === exportEntry.id);
      const tag = {
        id: exportEntry.id,
        name: exportEntry.name,
        status: optimized ? "PTV optimiert" : "Exportiert an PTV",
        exportedAt: exportEntry.createdAt,
        optimizedAt: optimized ? now : exportTags[tagIndex]?.optimizedAt || ""
      };

      if (tagIndex === -1) {
        exportTags.push(tag);
      } else {
        exportTags[tagIndex] = {
          ...exportTags[tagIndex],
          ...tag
        };
      }

      this.state.avisByOrder[orderNumber] = {
        ...current,
        ptvExportTags: exportTags,
        updatedAt: now,
        updatedBy: actorName,
        updatedByUserId: actor?.id || current.updatedByUserId || ""
      };
    }
  }

  async listLocalOrders() {
    return [...this.state.localOrders].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "de"));
  }

  hasLocalOrder(orderNumber) {
    return this.state.localOrders.some((order) => order.orderNumber === orderNumber);
  }

  async createLocalOrder(input, actor, avisInput = {}) {
    if (this.hasLocalOrder(input.orderNumber)) {
      throw new Error("Auftragsnummer ist bereits vorhanden.");
    }

    const now = new Date().toISOString();
    const order = {
      ...input,
      createdAt: now,
      createdBy: actor?.displayName || actor?.username || "",
      updatedAt: now,
      updatedBy: actor?.displayName || actor?.username || ""
    };

    this.state.localOrders.push(order);

    const actorName = actor?.displayName || actor?.username || "";
    const currentAvis = this.state.avisByOrder[input.orderNumber] || {};
    this.state.avisByOrder[input.orderNumber] = {
      ...currentAvis,
      ...(avisInput.driverPhoneId ? { driverPhoneId: avisInput.driverPhoneId } : {}),
      log: [
        ...(currentAvis.log || []),
        {
          id: crypto.randomUUID(),
          type: "angelegt",
          at: now,
          by: actorName,
          byUserId: actor?.id || ""
        }
      ],
      updatedAt: now,
      updatedBy: actorName,
      updatedByUserId: actor?.id || ""
    };

    await this.save();
    return order;
  }

  async deleteLocalOrder(orderNumber) {
    const index = this.state.localOrders.findIndex((order) => order.orderNumber === orderNumber);

    if (index === -1) {
      throw new Error("Lokaler Auftrag nicht gefunden.");
    }

    const [deleted] = this.state.localOrders.splice(index, 1);
    delete this.state.avisByOrder[orderNumber];
    await this.save();
    return deleted;
  }

  ensureAdminWouldRemain(nextUser, userId) {
    const users = this.state.users.map((user) => user.id === userId ? nextUser : user);
    const activeAdmins = users.filter((user) => user.active !== false && user.role === ROLE_ADMIN);

    if (activeAdmins.length === 0) {
      throw new Error("Mindestens ein aktiver Admin muss erhalten bleiben.");
    }
  }

  ensureActorMayWriteUser(input, existingUser, actor) {
    if (!canManageMasterdata(actor?.role)) {
      throw new Error("Nur Admins duerfen Benutzer verwalten.");
    }

    const actorIsAdmin = actor?.role === ROLE_ADMIN;
    const targetRole = input.role || existingUser?.role || ROLE_USER;
    const existingRole = existingUser?.role || "";

    if (!actorIsAdmin && (targetRole === ROLE_ADMIN || existingRole === ROLE_ADMIN)) {
      throw new Error("Nur Admins duerfen Admins verwalten.");
    }
  }

  async save() {
    const tempFile = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempFile, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
    await fs.rename(tempFile, this.filePath);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || ROLE_USER,
    active: user.active !== false,
    authProvider: user.authProvider || "local",
    theme: normalizeTheme(user.theme),
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || ""
  };
}

function normalizeTheme(value) {
  return ["light", "dark", "system"].includes(value) ? value : "light";
}

function uniqueOrderNumbers(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function canManageMasterdata(role) {
  return [ROLE_ADMIN, ROLE_SUPERUSER].includes(role);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [algorithm, salt, expectedHash] = String(passwordHash || "").split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
