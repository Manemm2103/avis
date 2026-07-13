import { Client, InvalidCredentialsError } from "ldapts";

const ROLE_USER = "user";
const ROLE_ADMIN = "admin";
const ROLE_DEPARTMENT_LEAD = "superuser";

export async function authenticateWithLdap(settings, username, password) {
  const config = normalizeLdapSettings(settings);

  if (!config.enabled) {
    return null;
  }

  if (!username || !password) {
    throw new Error("Benutzername oder Passwort ist falsch.");
  }

  validateLdapConfig(config);

  const client = new Client({
    url: `ldaps://${config.host}:${config.port}`,
    timeout: 10000,
    connectTimeout: 10000,
    tlsOptions: {
      rejectUnauthorized: config.verifyCertificate,
      ca: config.certificate ? [config.certificate] : undefined
    }
  });

  try {
    await client.bind(config.bindDn, config.bindPassword);
    const entry = await findLdapUser(client, config, username);
    const role = resolveRole(entry, config);

    await client.bind(entry.dn, password);

    return {
      username: ldapAttributeText(entry, config.loginAttribute) || username,
      displayName: ldapAttributeText(entry, "displayName") || ldapAttributeText(entry, "cn") || username,
      email: ldapAttributeText(entry, "mail"),
      role
    };
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      throw new Error("Benutzername oder Passwort ist falsch.");
    }

    throw error;
  } finally {
    await client.unbind().catch(() => {});
  }
}

function normalizeLdapSettings(settings = {}) {
  return {
    enabled: Boolean(settings.enabled),
    name: text(settings.name),
    host: text(settings.host),
    port: number(settings.port, 636),
    verifyCertificate: settings.verifyCertificate !== false,
    certificate: text(settings.certificate),
    bindDn: text(settings.bindDn),
    bindPassword: text(settings.bindPassword),
    baseDn: text(settings.baseDn),
    userFilter: text(settings.userFilter) || "(objectClass=*)",
    loginAttribute: text(settings.loginAttribute) || "sAMAccountName",
    userGroupDn: text(settings.userGroupDn),
    adminGroupDn: text(settings.adminGroupDn),
    departmentLeadGroupDn: text(settings.departmentLeadGroupDn)
  };
}

function validateLdapConfig(config) {
  const missing = [];

  if (!config.host) missing.push("Host");
  if (!config.port) missing.push("Port");
  if (!config.bindDn) missing.push("Systemkonto");
  if (!config.bindPassword) missing.push("Systemkonto-Kennwort");
  if (!config.baseDn) missing.push("Basis-DN");
  if (!config.loginAttribute) missing.push("Benutzername-Attribut");
  if (!config.userGroupDn) missing.push("User-Gruppe");
  if (!config.adminGroupDn) missing.push("Admin-Gruppe");
  if (!config.departmentLeadGroupDn) missing.push("Abteilungsleiter-Gruppe");

  if (missing.length > 0) {
    throw new Error(`LDAP ist unvollstaendig konfiguriert: ${missing.join(", ")}.`);
  }
}

async function findLdapUser(client, config, username) {
  const result = await client.search(config.baseDn, {
    scope: "sub",
    sizeLimit: 2,
    filter: buildUserFilter(config, username),
    attributes: [
      "dn",
      config.loginAttribute,
      "cn",
      "displayName",
      "givenName",
      "sn",
      "mail",
      "memberOf"
    ]
  });

  if (result.searchEntries.length === 0) {
    throw new Error("Benutzer ist in LDAP nicht fuer AVIS freigegeben.");
  }

  if (result.searchEntries.length > 1) {
    throw new Error("LDAP-Benutzer ist nicht eindeutig.");
  }

  return result.searchEntries[0];
}

function buildUserFilter(config, username) {
  return `(&(${config.loginAttribute}=${escapeFilterValue(username)})${normalizeFilter(config.userFilter)})`;
}

function normalizeFilter(filter) {
  const value = text(filter);

  if (!value) {
    return "(objectClass=*)";
  }

  return value.startsWith("(") && value.endsWith(")") ? value : `(${value})`;
}

function resolveRole(entry, config) {
  const groups = ldapAttributeValues(entry, "memberOf").map((value) => normalizeDn(value));

  if (groups.includes(normalizeDn(config.adminGroupDn))) {
    return ROLE_ADMIN;
  }

  if (groups.includes(normalizeDn(config.departmentLeadGroupDn))) {
    return ROLE_DEPARTMENT_LEAD;
  }

  if (groups.includes(normalizeDn(config.userGroupDn))) {
    return ROLE_USER;
  }

  throw new Error("Benutzer ist keiner freigegebenen AVIS-LDAP-Gruppe zugeordnet.");
}

function ldapText(value) {
  return ldapValues(value)[0] || "";
}

function ldapAttributeText(entry, attribute) {
  return ldapText(ldapAttributeValue(entry, attribute));
}

function ldapAttributeValues(entry, attribute) {
  return ldapValues(ldapAttributeValue(entry, attribute));
}

function ldapAttributeValue(entry, attribute) {
  if (Object.hasOwn(entry, attribute)) {
    return entry[attribute];
  }

  const normalizedAttribute = attribute.toLowerCase();
  const key = Object.keys(entry).find((item) => item.toLowerCase() === normalizedAttribute);
  return key ? entry[key] : "";
}

function ldapValues(value) {
  if (Array.isArray(value)) {
    return value.map(text).filter(Boolean);
  }

  return text(value) ? [text(value)] : [];
}

function normalizeDn(value) {
  return text(value).toLowerCase();
}

function escapeFilterValue(value) {
  return String(value)
    .replaceAll("\\", "\\5c")
    .replaceAll("*", "\\2a")
    .replaceAll("(", "\\28")
    .replaceAll(")", "\\29")
    .replaceAll("\u0000", "\\00");
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
