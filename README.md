# AVIS

AVIS ist eine Webanwendung fuer die Auftragsavisierung. Die Auftraege werden lesend aus einer bereits vorhandenen MS-SQL-Datenbank geholt, alle AVIS-Aenderungen werden lokal im Container-Volume gespeichert.

AVIS bringt keine eigene MS-SQL-Datenbank mit und legt dort keine Tabellen an. Die vorhandene Datenbank bleibt die Quelle fuer die Auftragsdaten.

## Aktueller Funktionsumfang

- Auftragsliste aus MS SQL oder Demo-Daten, wenn keine MS-SQL-Verbindung gesetzt ist
- `ABNUMMER` als eindeutiger Auftragsschluessel
- lokale Felder je Auftrag:
  - Liefertermin
  - Fahrertelefon
  - Avisiert ja/nein
  - Avisiert am
  - Bemerkung
- Stammdaten fuer Fahrertelefone
- Login mit lokaler Benutzerverwaltung, Rollen `User`, `Admin` und `Superuser`
- Auftragslog mit letztem Speichern/Avisieren und Benutzer
- Filter fuer Liefertag und Tour
- Massenbearbeitung: Fahrertelefon fuer alle gefilterten Auftraege speichern oder direkt avisieren
- manuelle Auftraege und CSV-Import fuer alle angemeldeten Benutzer, ohne bestehende Auftragsnummern zu ueberschreiben
- SQL-Abfragen nur fuer Superuser anpassbar
- Docker- und Portainer-taugliches Compose-Setup ohne zusaetzlichen Datenbankcontainer

## Login

Beim ersten Start legt AVIS automatisch einen lokalen Superuser an, wenn noch kein Benutzer existiert.

```env
AVIS_DEFAULT_ADMIN_USER=admin
AVIS_DEFAULT_ADMIN_PASSWORD=bitte-aendern
```

Fuer lokale Entwicklung ist der Standard `admin` / `admin`. Dieser Benutzer ist der Superuser. In Portainer sollte das Passwort unbedingt als Environment-Variable gesetzt werden.

User koennen Auftraege bearbeiten, avisieren, manuell erfassen und CSV-Dateien importieren. Admins koennen zusaetzlich Fahrertelefone pflegen, Auftraege loeschen und User/Admins anlegen, aber keine Superuser. Superuser koennen alles wie Admins und zusaetzlich SQL-Abfragen aendern.

## Erwartete Spalten der MS-SQL-Abfrage

Die SQL-Abfrage muss diese Aliasnamen liefern:

```sql
ABNUMMER,
KDNR,
KUNDE,
KUNDE_ANSCHRIFT,
KOMMISSION,
KAPA_LIEFERANSCHRIFT,
LIEFERTERMIN,
KAPA_TELEFON,
KAPA_EMAIL,
KAPA_TOUR
```

`KAPA_TOUR` kommt aus MS SQL und wird in AVIS nicht geaendert.

Optional kann fuer den Tourfilter eine separate Tourliste hinterlegt werden:

```sql
SELECT TOX_Bezeichnung
FROM [7_20180726_175746_KAPA_P_BW].[dbo].[KAPA_TOUR];
```

`MSSQL_QUERY` und `MSSQL_TOURS_QUERY` koennen in Docker/Portainer als Startwerte gesetzt werden. Superuser koennen beide Abfragen spaeter im Stammdatenbereich unter `SQL-Abfragen` anpassen, ohne das Image neu zu bauen.

## Lokaler Start

```bash
npm install
npm start
```

Danach ist AVIS unter `http://localhost:3000` erreichbar.

## Docker Compose

```bash
docker compose up -d --build
```

Die App speichert ihre lokalen Daten im Volume `avis-data`. Der externe Port kann mit `AVIS_HTTP_PORT` gesetzt werden, standardmaessig ist `3000`.

## Fertiges Docker Image

Bei jedem Push auf `main` baut GitHub Actions automatisch ein Image:

```text
ghcr.io/manemm2103/avis:latest
```

Fuer Portainer kann `docker-compose.image.yml` verwendet werden, wenn das Image aus der GitHub Container Registry gezogen werden soll. Falls Portainer beim Pull `denied` meldet, ist das Image noch nicht gebaut oder das Package ist in GitHub noch privat. In diesem Fall den Workflow `Docker image` einmal abwarten und das Package in GitHub unter `Packages` auf `Public` stellen oder in Portainer Registry-Zugangsdaten hinterlegen.

## Portainer

1. Neues Stack aus dem GitHub-Repository erstellen.
2. Environment-Variablen setzen:

```env
MSSQL_HOST=sqlserver.example.local
MSSQL_PORT=1433
MSSQL_DATABASE=DeineDatenbank
MSSQL_USER=avis_readonly
MSSQL_PASSWORD=...
AVIS_DEFAULT_ADMIN_USER=admin
AVIS_DEFAULT_ADMIN_PASSWORD=...
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
MSSQL_QUERY=SELECT ... AS ABNUMMER, ... AS LIEFERTERMIN, ... AS KAPA_TOUR FROM ...
MSSQL_TOURS_QUERY=SELECT TOX_Bezeichnung FROM ...
```

Die MS-SQL-Zugangsdaten und die echte interne SQL-Abfrage sollten nicht in ein oeffentliches Repository geschrieben werden.
