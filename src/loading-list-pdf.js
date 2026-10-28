import fs from "node:fs";

import PDFDocument from "pdfkit";

const PAGE = {
  margin: 24,
  contentBottom: 758
};

const COLORS = {
  teal: "#0f766e",
  text: "#1f2933",
  muted: "#5d6b78",
  line: "#cbd5dc",
  stop: "#dfecef",
  white: "#ffffff"
};

const COLUMNS = [
  { key: "sequence", label: "Folge", width: 28, align: "center" },
  { key: "orderNumber", label: "Auftrag", width: 62 },
  { key: "customerCommission", label: "Kunde / Kommission", width: 190 },
  { key: "blr", label: "BLR", width: 30, align: "right" },
  { key: "shippingEh", label: "EH", width: 38, align: "right" },
  { key: "storage", label: "Stellplatz", width: 58 },
  { key: "delivery", label: "Anliefertag", width: 66 },
  { key: "weight", label: "Gewicht", width: 51, align: "right" },
  { key: "trailer", label: "HÄ", width: 24, align: "center" }
];

const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);

export async function createLoadingListPdf({ exportEntry, orders, logoPath }) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    size: "A4",
    layout: "portrait",
    margins: { top: PAGE.margin, right: PAGE.margin, bottom: 0, left: PAGE.margin },
    info: {
      Title: `Ladeliste ${exportEntry.name || ""}`.trim(),
      Author: "AVIS",
      Subject: "Ladeliste für die LKW-Verladung"
    }
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const groupedStops = groupStops(orders);
  const totals = calculateTotals(orders);
  const transitionNumbers = new Set(
    exportEntry.twoDayTransitionOrderNumbers?.length
      ? exportEntry.twoDayTransitionOrderNumbers
      : exportEntry.twoDayTransitionOrderNumber ? [exportEntry.twoDayTransitionOrderNumber] : []
  );
  const twoDayTour = Boolean(exportEntry.twoDayTour || orders.some((order) => order.avis?.twoDayTour));
  const headerContext = { exportEntry, orders, totals, groupedStops, twoDayTour, logoPath };
  let y = 0;

  doc.on("pageAdded", () => {
    drawPageHeader(doc, headerContext);
    doc.y = 154;
  });

  const addPage = (continuedStop = "") => {
    doc.addPage();
    y = 154;

    if (continuedStop) {
      y = drawStopHeader(doc, y, continuedStop, "Fortsetzung");
      y = drawTableHeader(doc, y);
    }
  };

  addPage();

  groupedStops.forEach((stop, stopIndex) => {
    const stopHeight = estimatedStopHeight(doc, stop);
    const availablePageHeight = PAGE.contentBottom - 154;

    if (y > 400 || (y + stopHeight > PAGE.contentBottom && stopHeight <= availablePageHeight)) {
      addPage();
    } else if (y + 58 > PAGE.contentBottom) {
      addPage();
    }

    y = drawStopHeader(doc, y, stop.address, `${stop.orders.length} ${stop.orders.length === 1 ? "Auftrag" : "Aufträge"}`, stopIndex + 1);
    y = drawTableHeader(doc, y);

    stop.orders.forEach((order) => {
      const sequence = orders.indexOf(order) + 1;
      const row = loadingRow(order, sequence, transitionNumbers, twoDayTour);
      const rowHeight = measureRowHeight(doc, row);

      if (y + rowHeight > PAGE.contentBottom) {
        addPage(stop.address);
      }

      y = drawTableRow(doc, y, row, rowHeight, sequence % 2 === 0);
    });

    y += 8;
  });

  drawFooters(doc);
  doc.end();
  return completed;
}

function estimatedStopHeight(doc, stop) {
  let height = 57;

  stop.orders.forEach((order) => {
    const row = loadingRow(order, 1, new Set(), false);
    height += measureRowHeight(doc, row);
  });

  return height;
}

function drawPageHeader(doc, { exportEntry, orders, totals, groupedStops, twoDayTour, logoPath }) {
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, PAGE.margin, 22, { width: 105 });
  }

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(19).text("Ladeliste", 135, 24, { width: 220, lineBreak: false });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(exportEntry.name || "Tour ohne Bezeichnung", 135, 48, {
    width: TABLE_WIDTH - 111,
    height: 20,
    ellipsis: true
  });

  const driver = [exportEntry.driverPhoneLabel, exportEntry.driverPhoneNumber].filter(Boolean).join(" - ") || driverFromOrders(orders);
  const values = [
    ["Auslieferung", formatDeliveryRange(exportEntry.loadingListDeliveryDate || firstDeliveryDate(orders), twoDayTour)],
    ["Verladung", formatDate(exportEntry.loadingListLoadingDate)],
    ["LKW", exportEntry.loadingListLicensePlate || exportEntry.loadingListTruckLabel || "-"],
    ["Fahrer", driver || "-"],
    ["Entladestellen / Aufträge", `${groupedStops.length} / ${orders.length}`],
    ["BLR / Versand EH / Gewicht", `${formatNumber(totals.blr)} / ${formatNumber(totals.shippingEh)} / ${formatNumber(Math.round(totals.weight))} kg`]
  ];
  const columnWidth = TABLE_WIDTH / 3;
  const top = 76;

  values.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE.margin + column * columnWidth;
    const itemY = top + row * 31;
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(6.5).text(label.toUpperCase(), x, itemY, { width: columnWidth - 8 });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(8).text(value || "-", x, itemY + 11, {
      width: columnWidth - 8,
      height: 17,
      ellipsis: true
    });
  });

  doc.moveTo(PAGE.margin, 140).lineTo(PAGE.margin + TABLE_WIDTH, 140).lineWidth(1.2).strokeColor(COLORS.teal).stroke();
}

function drawStopHeader(doc, y, address, detail, sequence = "") {
  doc.roundedRect(PAGE.margin, y, TABLE_WIDTH, 25, 3).fill(COLORS.stop);
  if (sequence) {
    doc.circle(PAGE.margin + 15, y + 12.5, 9).fill(COLORS.teal);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8).text(String(sequence), PAGE.margin + 8, y + 8, { width: 14, align: "center" });
  }
  const textX = PAGE.margin + (sequence ? 31 : 10);
  const addressWidth = TABLE_WIDTH - (sequence ? 132 : 102);
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.5).text(fitSingleLine(doc, address || "-", addressWidth), textX, y + 7, {
    width: addressWidth,
    lineBreak: false
  });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(detail, PAGE.margin + TABLE_WIDTH - 94, y + 8, {
    width: 84,
    align: "right",
    lineBreak: false
  });
  return y + 29;
}

function drawTableHeader(doc, y) {
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + TABLE_WIDTH, y).lineWidth(0.8).strokeColor(COLORS.text).stroke();
  doc.moveTo(PAGE.margin, y + 20).lineTo(PAGE.margin + TABLE_WIDTH, y + 20).lineWidth(0.8).strokeColor(COLORS.text).stroke();
  let x = PAGE.margin;
  COLUMNS.forEach((column) => {
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(6.2).text(column.label, x + 2, y + 6, {
      width: column.width - 4,
      align: column.align || "left",
      lineBreak: false
    });
    x += column.width;
  });
  return y + 20;
}

function drawTableRow(doc, y, row, height, shaded) {
  if (shaded) {
    doc.rect(PAGE.margin, y, TABLE_WIDTH, height).fill("#f7f9fa");
  }
  doc.moveTo(PAGE.margin, y + height).lineTo(PAGE.margin + TABLE_WIDTH, y + height).lineWidth(0.4).strokeColor(COLORS.line).stroke();

  let x = PAGE.margin;
  COLUMNS.forEach((column) => {
    doc.fillColor(COLORS.text).font(column.key === "orderNumber" ? "Helvetica-Bold" : "Helvetica").fontSize(6.7);
    const width = column.width - 4;
    const lines = wrapCellText(doc, row[column.key] || "-", width);
    lines.forEach((line, index) => {
      doc.text(line, x + 2, y + 5 + index * 8, {
        width,
        align: column.align || "left",
        lineBreak: false
      });
    });
    x += column.width;
  });
  return y + height;
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.moveTo(PAGE.margin, 777).lineTo(PAGE.margin + TABLE_WIDTH, 777).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(`Erstellt am ${new Date().toLocaleString("de-DE")}`, PAGE.margin, 784, {
      width: TABLE_WIDTH / 2,
      lineBreak: false
    });
    doc.text(`Seite ${index - range.start + 1} von ${range.count}`, PAGE.margin + TABLE_WIDTH / 2, 784, {
      width: TABLE_WIDTH / 2,
      align: "right",
      lineBreak: false
    });
  }
}

function measureRowHeight(doc, row) {
  let height = 24;
  COLUMNS.forEach((column) => {
    doc.font(column.key === "orderNumber" ? "Helvetica-Bold" : "Helvetica").fontSize(6.7);
    const lineCount = wrapCellText(doc, row[column.key] || "-", column.width - 4).length;
    height = Math.max(height, Math.min(48, lineCount * 8 + 10));
  });
  return height;
}

function wrapCellText(doc, value, width, maxLines = 4) {
  const lines = [];
  const paragraphs = String(value || "-").split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";

    for (const word of words.length ? words : ["-"]) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line);
      }
      line = fitSingleLine(doc, word, width);

      if (lines.length >= maxLines) {
        break;
      }
    }

    if (line && lines.length < maxLines) {
      lines.push(line);
    }
    if (lines.length >= maxLines) {
      break;
    }
  }

  return lines.slice(0, maxLines);
}

function fitSingleLine(doc, value, width) {
  const text = String(value || "-");
  if (doc.widthOfString(text) <= width) {
    return text;
  }

  let shortened = text;
  while (shortened.length > 1 && doc.widthOfString(`${shortened}...`) > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

function loadingRow(order, sequence, transitionNumbers, twoDayTour) {
  const transition = transitionNumbers.has(order.orderNumber) || order.avis?.twoDayTransition || order.avis?.twoDayTour;
  const dayTwo = twoDayTour && Number(order.avis?.tourDeliveryDayOffset) === 1 && !transition;
  const tags = [
    transition ? "2-Tagestour" : "",
    dayTwo ? "Tag 2" : "",
    order.avis?.skipAvis ? "Keine Avis" : ""
  ].filter(Boolean);
  return {
    sequence: String(sequence),
    orderNumber: order.orderNumber,
    customerCommission: [order.customerName || "-", order.commission || "-"].join("\n"),
    blr: order.blrCount || "-",
    shippingEh: order.shippingEh || "-",
    storage: order.eprodStorageLocation || "-",
    delivery: [formatDate(order.displayDeliveryDate || order.deliveryDate), ...tags].filter(Boolean).join("\n"),
    weight: parseNumber(order.elementWeight) ? `${formatNumber(Math.round(parseNumber(order.elementWeight)))} kg` : "-",
    trailer: order.avis?.mwTrailer ? "HÄ" : "-"
  };
}

function groupStops(orders) {
  const stops = [];
  const byAddress = new Map();
  orders.forEach((order) => {
    const address = order.deliveryAddress
      || [order.deliveryCountry, order.deliveryPostalCode, order.deliveryCity, order.deliveryStreet].filter(Boolean).join(" ")
      || "-";
    const key = address.replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");
    if (!byAddress.has(key)) {
      const stop = { address, orders: [] };
      byAddress.set(key, stop);
      stops.push(stop);
    }
    byAddress.get(key).orders.push(order);
  });
  return stops;
}

function calculateTotals(orders) {
  return orders.reduce((totals, order) => ({
    blr: totals.blr + parseNumber(order.blrCount),
    shippingEh: totals.shippingEh + parseNumber(order.shippingEh),
    weight: totals.weight + parseNumber(order.elementWeight)
  }), { blr: 0, shippingEh: 0, weight: 0 });
}

function driverFromOrders(orders) {
  return orders.map((order) => order.avis?.driverPhoneLabel).find(Boolean) || "-";
}

function firstDeliveryDate(orders) {
  return orders.map((order) => order.displayDeliveryDate || order.deliveryDate).find(Boolean) || "";
}

function formatDeliveryRange(value, twoDayTour) {
  if (!value) {
    return "-";
  }
  if (!twoDayTour) {
    return formatDate(value);
  }
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return formatDate(value);
  }
  date.setDate(date.getDate() + 1);
  return `${formatDate(value)} - ${date.toLocaleDateString("de-DE")}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("de-DE");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function parseNumber(value) {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}
