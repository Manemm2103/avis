SELECT
  Auftrag AS ABNUMMER,
  Kundennummer AS KDNR,
  Kunde AS KUNDE,
  Kundenanschrift AS KUNDE_ANSCHRIFT,
  Kommission AS KOMMISSION,
  Lieferanschrift AS KAPA_LIEFERANSCHRIFT,
  Liefertermin AS LIEFERTERMIN,
  Telefon AS KAPA_TELEFON,
  Email AS KAPA_EMAIL,
  Tour AS KAPA_TOUR
FROM DeineAuftragstabelle
WHERE GeliefertAm IS NULL;

-- Optional fuer den Tourfilter:
SELECT Tourbezeichnung AS TOX_Bezeichnung
FROM DeineTourtabelle;
