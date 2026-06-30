import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ORDERS_QUERY = `SELECT DISTINCT
       AIX_PTABBELEGNR ABNUMMER,
       AIX_KUNDENNR KDNR,

       CONCAT_WS(' ',
           NULLIF(LTRIM(RTRIM(GPX_ANREDE)), ''),
           NULLIF(LTRIM(RTRIM(GPX_NAME)), '')
       ) AS KUNDE,

       CONCAT_WS(' ',
           NULLIF(LTRIM(RTRIM(GPX_16_TEXT_FF_LAND)), '') + '-' + NULLIF(LTRIM(RTRIM(GPX_PLZSTRASSE)), ''),
           NULLIF(LTRIM(RTRIM(GPX_ORT)), '') + ',',
           NULLIF(LTRIM(RTRIM(GPX_STRASSE)), '')
       ) AS KUNDE_ANSCHRIFT,

       BSX_BEZEICHNUNG KOMMISSION,
       CONCAT_WS('', [LAX_PLZ], '  ', [LAX_STRASSE], ' ', [LAX_ORT]) KAPA_LIEFERANSCHRIFT,
       CONVERT(date, ISNULL([AIX_LIEFERTERMINMANUELL], [AIX_LIEFERTERMIN])) LIEFERTERMIN,

       COALESCE(
           NULLIF(LTRIM(RTRIM(AIX_TELEFON)), ''),
           ITK_TEL.ITKONTAKT_WERT,
           ITK_TEL_ZENTRALE.ITKONTAKT_WERT
       ) AS KAPA_TELEFON,

       COALESCE(
           NULLIF(LTRIM(RTRIM(AIX_EMAIL)), ''),
           ITK_MAIL.ITKONTAKT_WERT,
           ITK_MAIL_FALLBACK.ITKONTAKT_WERT
       ) AS KAPA_EMAIL,

       AIX_TOUR KAPA_TOUR,
       AIX_FFNUM_59_EH_VERSAND AS VERSAND_EH,
       AIX_FFBMODE_74_GEWICHTFENSTER AS GEWICHT_ELEMENTE,
       AIX_FFBMODE_8_ANZ_BLR AS ANZ_BLR,
       AIX_FFTEXT_114_E_PROD_LAGERPLATZ AS EPROD_LAGERPLATZ
FROM [7_20180726_175746_KAPA_P_BW].[dbo].[KAPA_AUFTRAGINFO]
LEFT JOIN [7_20180726_175746_KAPA_P_BW].[dbo].[KAPA_LIEFERANSCHRIFT]
       ON [LAX_AT_ID] = [AIX_AT_ID]
LEFT JOIN [7_20180726_175746_KAPA_P_BW].[dbo].[KAPA_AUFTRAG]
       ON [AIX_PTABBELEGNR] = [ATX_NUMMER]
LEFT JOIN [7_20180726_175746_KBS_P_BW].[dbo].[GP]
       ON AIX_KUNDENNR = [GPX_IDENTNUMMER]

OUTER APPLY (
    SELECT TOP 1
           ITKONTAKT_WERT
    FROM [7_20180726_175746_KBS_P_BW].[dbo].[ITKONTAKT]
    WHERE ITKONTAKT_IDGP = GPX_ID
      AND ITKONTAKT_IVERBINDUNGSART = 3
      AND ISNULL(ITKONTAKT_WERT, '') <> ''
    ORDER BY ITKONTAKT_ID
) ITK_TEL

OUTER APPLY (
    SELECT TOP 1
           ITKONTAKT_WERT
    FROM [7_20180726_175746_KBS_P_BW].[dbo].[ITKONTAKT]
    WHERE ITKONTAKT_IDGP = GPX_ID
      AND ITKONTAKT_IVERBINDUNGSART = 1
      AND ITKONTAKT_BEZ LIKE '%Zentrale%'
      AND ISNULL(ITKONTAKT_WERT, '') <> ''
    ORDER BY ITKONTAKT_ID
) ITK_TEL_ZENTRALE

OUTER APPLY (
    SELECT TOP 1
           ITKONTAKT_WERT
    FROM [7_20180726_175746_KBS_P_BW].[dbo].[ITKONTAKT]
    WHERE ITKONTAKT_IDGP = GPX_ID
      AND ITKONTAKT_IVERBINDUNGSART = 5
      AND ISNULL(ITKONTAKT_WERT, '') <> ''
    ORDER BY ITKONTAKT_ID
) ITK_MAIL

OUTER APPLY (
    SELECT TOP 1
           ITKONTAKT_WERT
    FROM [7_20180726_175746_KBS_P_BW].[dbo].[ITKONTAKT]
    WHERE ITKONTAKT_IDGP = GPX_ID
      AND ITKONTAKT_IVERBINDUNGSART = 4
      AND ISNULL(ITKONTAKT_WERT, '') <> ''
    ORDER BY ITKONTAKT_ID
) ITK_MAIL_FALLBACK

LEFT JOIN [7_20180726_175746_KBS_P_BW].[dbo].[VKBELEGSTUB]
       ON BSX_BELEGNR = AIX_PTABBELEGNR
WHERE [AIX_GELIEFERTMELDUNGSDATUM] IS NULL
  AND ATX_STATUS NOT IN ('288', '32', '544', '36')
  AND AIX_KUNDENNR <> '5400596'`;

const DEFAULT_TOURS_QUERY = `SELECT TOX_Bezeichnung
FROM [7_20180726_175746_KAPA_P_BW].[dbo].[KAPA_TOUR];`;

export function loadConfig() {
  const queryFile = text(process.env.MSSQL_QUERY_FILE);
  const inlineQuery = text(process.env.MSSQL_QUERY);
  const toursQueryFile = text(process.env.MSSQL_TOURS_QUERY_FILE);
  const inlineToursQuery = text(process.env.MSSQL_TOURS_QUERY);

  return {
    port: number(process.env.PORT, 3000),
    dataFile: text(process.env.AVIS_DATA_FILE) || path.join(process.cwd(), "data", "avis.json"),
    auth: {
      defaultAdminUser: text(process.env.AVIS_DEFAULT_ADMIN_USER) || "admin",
      defaultAdminPassword: text(process.env.AVIS_DEFAULT_ADMIN_PASSWORD) || "admin",
      resetAdminPassword: bool(process.env.AVIS_RESET_ADMIN_PASSWORD, false)
    },
    mssql: {
      host: text(process.env.MSSQL_HOST),
      port: number(process.env.MSSQL_PORT, 1433),
      database: text(process.env.MSSQL_DATABASE),
      user: text(process.env.MSSQL_USER),
      password: text(process.env.MSSQL_PASSWORD),
      encrypt: bool(process.env.MSSQL_ENCRYPT, false),
      trustServerCertificate: bool(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
      query: inlineQuery || readOptionalFile(queryFile) || DEFAULT_ORDERS_QUERY,
      queryFile,
      toursQuery: inlineToursQuery || readOptionalFile(toursQueryFile) || DEFAULT_TOURS_QUERY,
      toursQueryFile
    }
  };
}

function readOptionalFile(filePath) {
  if (!filePath) {
    return "";
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return "";
  }

  return fs.readFileSync(resolved, "utf8").trim();
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "ja"].includes(String(value).toLowerCase());
}
