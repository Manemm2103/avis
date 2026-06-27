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
  ["{{liefertermin_iso}}", "Liefertermin als JJJJ-MM-TT"],
  ["{{kw}}", "Kalenderwoche, z. B. KW25"],
  ["{{kalenderwoche}}", "Kalenderwoche mit Jahr"],
  ["{{tour}}", "Tour"],
  ["{{kontakt_telefon}}", "Telefon aus dem Auftrag"],
  ["{{kontakt_email}}", "E-Mail aus dem Auftrag"],
  ["{{fahrertelefon}}", "Fahrertelefon mit Bezeichnung"],
  ["{{fahrertelefon_bezeichnung}}", "Bezeichnung des Fahrertelefons"],
  ["{{fahrertelefon_nummer}}", "Telefonnummer des Fahrers"],
  ["{{bemerkung}}", "Interne Bemerkung am Auftrag"],
  ["{{info_fuer_kunden}}", "Info fuer Kunden"],
  ["{{zwei_tagestour}}", "Ja/Nein fuer 2-Tagestour"],
  ["{{status}}", "Avisiert oder Nicht avisiert"],
  ["{{gespeichert_am}}", "Letzte Speicherung"],
  ["{{gespeichert_von}}", "Benutzer der letzten Speicherung"],
  ["{{avisiert_am}}", "Letzte Avisierung"],
  ["{{avisiert_von}}", "Benutzer der letzten Avisierung"]
].map(([token, description]) => ({ token, description }));

export async function sendAvisMail(order, settings = {}) {
  const recipients = targetRecipients(order, settings);

  if (!isMailConfigured(settings)) {
    return skipped("SMTP oder Absender ist noch nicht vollstaendig eingerichtet.", recipients, settings);
  }

  if (recipients.length === 0) {
    return skipped(settings.demoMode ? "Demobetrieb ist aktiv, aber es sind keine Demo-Empfaenger eingetragen." : "Am Auftrag ist keine Kunden-E-Mail hinterlegt.", recipients, settings);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort) || 587,
      secure: Boolean(settings.smtpSecure),
      auth: settings.smtpUser ? {
        user: settings.smtpUser,
        pass: settings.smtpPassword || ""
      } : undefined
    });
    const body = renderMailTemplate(settings.body || "", order);
    const subject = renderMailTemplate(settings.subject || "Avisierung Auftrag {{auftrag}}", order);
    const info = await transporter.sendMail({
      from: mailAddress(settings.fromEmail, settings.fromName),
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
      messageId: info.messageId || "",
      demoMode: Boolean(settings.demoMode)
    };
  } catch (error) {
    return {
      status: "failed",
      sent: false,
      skipped: false,
      failed: true,
      recipients,
      message: error.message,
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

function skipped(message, recipients, settings = {}) {
  return {
    status: "skipped",
    sent: false,
    skipped: true,
    failed: false,
    recipients,
    message,
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

  return {
    auftrag: order.orderNumber || "",
    auftragsnummer: order.orderNumber || "",
    kunde: order.customerName || "",
    kundennummer: order.customerNumber || "",
    kdnr: order.customerNumber || "",
    kundenanschrift: order.customerAddress || "",
    kommission: order.commission || "",
    lieferanschrift: order.deliveryAddress || "",
    liefertag: formatDate(deliveryDate),
    liefertermin: formatDate(deliveryDate),
    liefertermin_iso: deliveryDate,
    kw: formatWeekShort(deliveryWeek),
    kalenderwoche: deliveryWeek,
    tour: order.displayTour || order.tour || "",
    kontakt_telefon: order.sourcePhone || "",
    kontakt_email: order.sourceEmail || "",
    fahrertelefon: avis.driverPhoneLabel || "",
    fahrertelefon_bezeichnung: avis.driverPhoneName || "",
    fahrertelefon_nummer: avis.driverPhoneNumber || "",
    bemerkung: avis.note || "",
    info_fuer_kunden: avis.customerInfo || "",
    zwei_tagestour: avis.twoDayTour ? "Ja" : "Nein",
    status: avis.notified ? "Avisiert" : "Nicht avisiert",
    gespeichert_am: formatDateTime(avis.updatedAt),
    gespeichert_von: avis.updatedBy || "",
    avisiert_am: formatDateTime(avis.notifiedAt),
    avisiert_von: avis.notifiedBy || ""
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

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatWeekShort(value) {
  const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
  return match ? `KW${match[2]}` : value || "";
}
