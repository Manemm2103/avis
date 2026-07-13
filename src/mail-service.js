import nodemailer from "nodemailer";

export const MAIL_TEXT_MARKS = [
  ["{{auftrag}}", "Auftragsnummer"],
  ["{{auftragsnummer}}", "Auftragsnummer"],
  ["{{kunde}}", "Kundenname"],
  ["{{kundennummer}}", "Kundennummer"],
  ["{{kdnr}}", "Kundennummer"],
  ["{{kundenanschrift}}", "Kundenanschrift"],
  ["{{kommission}}", "Kommission"],
  ["{{lieferanschrift}}", "Lieferanschrift"],
  ["{{liefertag}}", "Liefertermin formatiert"],
  ["{{liefertermin}}", "Liefertermin formatiert"],
  ["{{kw}}", "Kalenderwoche, z. B. KW25"],
  ["{{tour}}", "Tour"],
  ["{{kontakt_telefon}}", "Telefon aus dem Auftrag"],
  ["{{kontakt_email}}", "E-Mail aus dem Auftrag"],
  ["{{fahrertelefon}}", "Fahrertelefon mit Bezeichnung"],
  ["{{fahrertelefon_nummer}}", "Telefonnummer des Fahrers"],
  ["{{bemerkung}}", "Interne Bemerkung am Auftrag"],
  ["{{info_fuer_kunden}}", "Info für Kunden"],
  ["{{gespeichert_von}}", "Benutzer der letzten Speicherung"]
].map(([token, description]) => ({ token, description }));

export async function sendAvisMail(order, settings = {}) {
  const recipients = targetRecipients(order, settings);
  const body = renderMailTemplate(settings.body || "", order);
  const subject = renderMailTemplate(settings.subject || "Avisierung Auftrag {{auftrag}}", order);
  const from = mailAddress(settings.fromEmail, settings.fromName);

  if (!isMailConfigured(settings)) {
    return skipped("SMTP oder Absender ist noch nicht vollstaendig eingerichtet.", recipients, settings, { body, subject, from });
  }

  if (recipients.length === 0) {
    return skipped(settings.demoMode ? "Demobetrieb ist aktiv, aber es sind keine Demo-Empfaenger eingetragen." : "Am Auftrag ist keine Kunden-E-Mail hinterlegt.", recipients, settings, { body, subject, from });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort) || 587,
      secure: Boolean(settings.smtpSecure),
      tls: {
        rejectUnauthorized: Boolean(settings.smtpVerifyCertificate),
        servername: settings.smtpHost || undefined
      },
      auth: settings.smtpUser ? {
        user: settings.smtpUser,
        pass: settings.smtpPassword || ""
      } : undefined
    });
    const info = await transporter.sendMail({
      from,
      to: recipients.join(", "),
      replyTo: settings.replyTo || undefined,
      subject,
      text: body,
      html: textToHtml(body)
    });

    return {
      status: "sent",
      sent: true,
      skipped: false,
      failed: false,
      recipients,
      sentAt: new Date().toISOString(),
      subject,
      body,
      from,
      replyTo: settings.replyTo || "",
      messageId: info.messageId || "",
      demoMode: Boolean(settings.demoMode)
    };
  } catch (error) {
    const errorInfo = mailErrorInfo(error, settings);

    return {
      status: "failed",
      sent: false,
      skipped: false,
      failed: true,
      recipients,
      message: errorInfo.message,
      hint: errorInfo.hint,
      code: errorInfo.code,
      command: errorInfo.command,
      responseCode: errorInfo.responseCode,
      subject,
      body,
      from,
      replyTo: settings.replyTo || "",
      demoMode: Boolean(settings.demoMode)
    };
  }
}

export function renderMailTemplate(template, order) {
  const values = mailValues(order);

  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => values[normalizeTokenKey(key)] ?? "");
}

function targetRecipients(order, settings) {
  if (settings.demoMode) {
    return splitRecipients(settings.demoRecipients);
  }

  return splitRecipients(order?.sourceEmail);
}

function isMailConfigured(settings) {
  return Boolean(settings.smtpHost && settings.fromEmail);
}

function mailErrorInfo(error, settings) {
  const message = error?.message || "Unbekannter SMTP-Fehler.";
  const code = error?.code || "";
  const lower = `${message} ${code}`.toLowerCase();
  let hint = "";

  if (lower.includes("wrong version number") || lower.includes("ssl routines")) {
    hint = Number(settings.smtpPort) === 465
      ? "SMTP-Server/Port erwartet vermutlich kein direktes SSL. Testweise SMTP SSL/TLS deaktivieren oder den korrekten SMTP-Port prüfen."
      : "Wahrscheinlich ist SMTP SSL/TLS aktiv, obwohl der Port STARTTLS erwartet. Bei Port 587 SMTP SSL/TLS deaktivieren; bei Port 465 aktivieren.";
  } else if (lower.includes("unable to verify") || lower.includes("self-signed") || lower.includes("certificate") || lower.includes("cert")) {
    hint = "Der SMTP-Server liefert ein Zertifikat, dem Node/Docker nicht vertraut. SMTP-Zertifikat prüfen auf Nein stellen oder das Zertifikat im Container vertrauenswürdig machen.";
  } else if (lower.includes("auth") || lower.includes("login") || lower.includes("credential")) {
    hint = "SMTP-Benutzer oder Kennwort prüfen.";
  } else if (lower.includes("enotfound") || lower.includes("econnrefused") || lower.includes("etimedout")) {
    hint = "SMTP Host, Port, DNS und Firewall-Verbindung aus dem Docker-Container prüfen.";
  }

  return {
    message,
    hint,
    code,
    command: error?.command || "",
    responseCode: error?.responseCode || ""
  };
}

function skipped(message, recipients, settings = {}, rendered = {}) {
  return {
    status: "skipped",
    sent: false,
    skipped: true,
    failed: false,
    recipients,
    message,
    subject: rendered.subject || "",
    body: rendered.body || "",
    from: rendered.from || "",
    replyTo: settings.replyTo || "",
    demoMode: Boolean(settings.demoMode)
  };
}

function splitRecipients(value) {
  return [...new Set(String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item && item.includes("@")))];
}

function mailValues(order = {}) {
  const avis = order.avis || {};
  const deliveryDate = order.displayDeliveryDate || order.deliveryDate || "";
  const deliveryWeek = order.displayDeliveryWeek || "";
  const deliveryText = formatDeliveryDateForMail(deliveryDate, avis.twoDayTour);

  return {
    auftrag: order.orderNumber || "",
    auftragsnummer: order.orderNumber || "",
    kunde: order.customerName || "",
    kundennummer: order.customerNumber || "",
    kdnr: order.customerNumber || "",
    kundenanschrift: order.customerAddress || "",
    kommission: order.commission || "",
    lieferanschrift: order.deliveryAddress || "",
    liefertag: deliveryText,
    liefertermin: deliveryText,
    kw: formatWeekShort(deliveryWeek),
    tour: order.displayTour || order.tour || "",
    kontakt_telefon: order.sourcePhone || "",
    kontakt_email: order.sourceEmail || "",
    fahrertelefon: avis.driverPhoneLabel || "",
    fahrertelefon_nummer: avis.driverPhoneNumber || "",
    bemerkung: avis.note || "",
    info_fuer_kunden: avis.customerInfo || "",
    gespeichert_von: avis.updatedBy || ""
  };
}

function normalizeTokenKey(value) {
  return String(value || "").trim().toLowerCase();
}

function mailAddress(email, name) {
  if (!name) {
    return email;
  }

  return `"${String(name).replace(/"/g, "'")}" <${email}>`;
}

function textToHtml(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => escapeHtml(line) || "&nbsp;")
    .join("<br>");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value || "";
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatDeliveryDateForMail(value, twoDayTour) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match || !twoDayTour) {
    return formatDate(value);
  }

  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const startDay = String(start.getUTCDate()).padStart(2, "0");
  const startMonth = String(start.getUTCMonth() + 1).padStart(2, "0");
  const startYear = String(start.getUTCFullYear());
  const endDay = String(end.getUTCDate()).padStart(2, "0");
  const endMonth = String(end.getUTCMonth() + 1).padStart(2, "0");
  const endYear = String(end.getUTCFullYear());

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}-${endDay}.${startMonth}.${startYear}`;
  }

  if (startYear === endYear) {
    return `${startDay}.${startMonth}-${endDay}.${endMonth}.${startYear}`;
  }

  return `${startDay}.${startMonth}.${startYear}-${endDay}.${endMonth}.${endYear}`;
}

function formatWeekShort(value) {
  const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
  return match ? `KW${match[2]}` : value || "";
}
