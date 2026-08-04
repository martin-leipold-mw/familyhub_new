# Reconnect-Snackbar bei abgelaufener Google-Verbindung

**Datum:** 2026-08-04
**Status:** Entwurf bestätigt, bereit für Implementierungsplan
**Ersetzt:** den Ansatz aus `2026-08-03-google-reconnect-banner-design.md` (globaler Dauer-Banner). Der dort gebaute `ConnectionRevokedBanner` wird entfernt.

## Problem

Wenn ein Google-Konto zwar verbunden ist, der Refresh-Token aber abgelaufen/entzogen wurde
(`invalid_grant`), scheitert der Kalender-Sync für dieses Konto. Der Kalender selbst zeigt weiter
die lokal gespiegelten Termine, aber neue Änderungen aus Google kommen nicht mehr an.

Der bisherige Ansatz — ein globaler Dauer-Banner oben, der stumpf auf den gepollten Status reagiert
und einen Kalender-Reload anbietet — ist unerwünscht:

- Ein Reload-Button existiert bereits (Refresh im Kalender-Header).
- Der Dauer-Banner nennt nicht, **welches** Konto betroffen ist.
- Gewünscht ist eine **Snackbar**, die aufpoppt, wenn der Kalender wegen abgelaufener Verbindung
  nicht mehr geladen werden kann, mit dem betroffenen Konto und einem Weg zur Neu-Anmeldung.

## Kontext (Ist-Zustand)

- **Backend setzt `status = "revoked"` nur als Nebeneffekt** eines Token-Refreshs: In
  `GoogleTokenProvider.validAccessToken()` wird bei `invalid_grant` der Status auf `"revoked"`
  gesetzt und `GoogleConnectionRevokedException` geworfen.
- Der `GlobalExceptionHandler` bildet diese Exception auf **HTTP 409** mit
  `code = "GOOGLE_CONNECTION_REVOKED"` ab.
- **`CalendarSyncService.syncConnection()` überspringt** Verbindungen mit `status != "active"`
  (`return SyncResult(0,0,0)` **ohne Fehler**). Konsequenz: Der 409 fliegt **nur beim ersten** Sync,
  der den toten Token entdeckt. Ist der Status erst einmal `"revoked"`, liefern Folge-Syncs
  stillschweigend „0 Termine".
- Der Sync läuft **pro Member** (`syncCalendars({ memberId })` → `syncForMember` →
  `findByFamilyMemberId` → genau eine Verbindung pro Member).
- `useCalendarSync` (Frontend) sammelt Sync-Fehler heute nur in ein generisches `isError`, ohne
  Konto-Zuordnung. Es läuft beim App-Start und beim manuellen Refresh.
- Die Verbindungsliste (`ConnectionResponse` mit `email`, `name`, `memberId`, `status`,
  `connectionId`) wird per `useGoogleConnections` alle 60 s gepollt.
- `authorizeGoogle` nimmt nur `returnUrl` (+ optional `credentialsId`); kein `memberId`/`login_hint`.
- **Es gibt keine Toast-/Snackbar-Infrastruktur** im Frontend, und keine Toast-Dependency.
- Es läuft **kein** Hintergrund-Scheduler (kein 15-Min-Auto-Sync) — bewusst so gewollt. Detektion
  kann also nur bei einem tatsächlichen Sync-Versuch passieren.

## Ziel

Eine Snackbar, die

1. **beim fehlgeschlagenen Sync** eines verbundenen Kontos wegen abgelaufener Verbindung erscheint,
2. **das betroffene Konto** (Name + E-Mail) benennt,
3. über einen Dialog die **Neu-Anmeldung bei Google** für dieses Konto anstößt,
4. den unerwünschten globalen Dauer-Banner ersetzt.

## Entwurf

### 1. Umfang & Entfernungen

- **Entfernen:** `frontend/src/features/google/ConnectionRevokedBanner.tsx` und
  `ConnectionRevokedBanner.test.tsx`; die Einbindung in `AppShell`; zugehörige Assertions in
  `AppShell.test.tsx` / `App.test.tsx`.
- **Kein Backend-/Contract-Change** für den MVP. 409 `GOOGLE_CONNECTION_REVOKED` und die
  `status`-Felder existieren bereits und genügen.
- Die bestehende Reconnect-UI in `GoogleAccountsSettings` (Einstellungen) bleibt unverändert.

### 2. Erkennung & Auslöser (bestätigte Entscheidung)

**Der Sync ist der Detektor. Die Snackbar spiegelt die revoked-Konten aus der Verbindungsliste.**

- `useCalendarSync` bleibt der Auslöser (läuft bei App-Start und manuellem Refresh). Ein Sync-Versuch
  ist das, was den toten Token entdeckt und im Backend `status = "revoked"` setzt.
- **Nach jedem Sync-Durchlauf** (unabhängig davon, ob 409 geworfen wurde) invalidiert der Sync die
  Verbindungs-Query, sodass die Liste den frischen `status` widerspiegelt.
- Die Snackbar-Logik leitet aus der Verbindungsliste **eine Snackbar pro Konto mit
  `status === "revoked"`** ab.
- Folge: Die Snackbar erscheint sofort bei Erkennung und **erneut nach einem Reload**, solange das
  Konto revoked ist (weil der Sync beim App-Start erneut läuft und die revoked-Verbindung weiter in
  der Liste steht). Das ist **kein** reines 60-s-Pollen — der Sync bleibt der Auslöser.

*Verworfene Alternative:* Nur der 409-Event triggert die Snackbar. Dann erschiene sie genau einmal
pro Erkennung und wäre nach einem Reload verschwunden, obwohl das Konto noch kaputt ist — schlecht
für ein Wanddisplay.

### 3. Snackbar-Infrastruktur

Ein hauseigener `SnackbarProvider` (React Context + Queue), im Stil von `PinSessionContext` — **keine
neue Dependency**. Im `AppShell` gemountet, rendert gestapelte Snackbars am unteren Rand.

- **Eine Snackbar pro betroffenem Konto**; mehrere revoked Konten werden gestapelt.
- **Kein Auto-Timeout.** Kritischer, handlungspflichtiger Hinweis: bleibt bis zur Aktion oder bis der
  Nutzer sie manuell schließt (X). Erscheint beim nächsten Sync erneut, wenn weiterhin revoked.
- Dedupe pro Konto: keine doppelten Snackbars fürs selbe Konto, auch wenn der Sync mehrfach läuft.
- UI-Konventionen: deutsche Texte, Touch-Targets ≥ 44 × 44 px, hoher Kontrast, große Schrift.
- Text: **„{Name} ({E-Mail}): Google-Verbindung abgelaufen. Bitte neu verbinden."**
- Aktions-Button: **„Neu verbinden"**. Schließen-Button (X) mit `aria-label`.
- `role="alert"` / passende ARIA-Rolle für Zugänglichkeit.

Die Verdrahtung „revoked-Konten → Snackbars" kann ein kleiner Hook/Effekt übernehmen, der die
Verbindungsliste beobachtet und für jedes neue revoked Konto eine Snackbar über den Provider
einreiht (und beim Wechsel auf `active` wieder entfernt).

### 4. Reconnect-Dialog & Flow

Klick auf **„Neu verbinden"** öffnet einen In-App-Dialog:

```
╭─ Verbindung abgelaufen ─╮
│                         │
│ Papa                    │
│ papa@gmail.com          │
│                         │
│ [ Bei Google anmelden ] │
│ [ Abbrechen ]           │
╰─────────────────────────╯
```

- Zeigt **Name + E-Mail** des betroffenen Kontos.
- **„Bei Google anmelden"** ruft `useStartGoogleAuth({ returnUrl: window.location.pathname })` und
  macht den bestehenden **Full-Page-Redirect** zu Google; kehrt danach zum Ausgangs-Screen zurück.
- **„Abbrechen"** schließt den Dialog; die Snackbar bleibt bestehen (Konto weiter revoked).
- Nach erfolgreicher Rückkehr setzt der OAuth-Callback den Status zurück auf `"active"`; Snackbar und
  Dialog verschwinden beim nächsten Statusabgleich.
- Kein PIN-Gate: Die Google-Consent-Seite ist der Schutz (konsistent mit dem alten Banner-Ansatz).

### 5. Optional (KANN, nicht im MVP): `login_hint`

Damit Google auf dem Kiosk automatisch das richtige Konto vorauswählt, könnte `authorizeGoogle`
später einen `loginHint`-Query-Parameter (die betroffene E-Mail) erhalten. Das ist ein
Contract-Change (OpenAPI + oasdiff) und wird **bewusst aus dem MVP herausgehalten**. Der MVP nutzt
den bestehenden Flow; der Nutzer wählt auf Googles Seite das Konto selbst.

### 6. Tests

- **Unit:**
  - `SnackbarProvider`: Einreihen, Stapeln, manuelles Schließen, Dedupe pro Konto.
  - Reconnect-Dialog: zeigt Name/E-Mail, „Bei Google anmelden" startet den Auth-Flow mit korrekter
    `returnUrl`, „Abbrechen" schließt ohne Auth.
  - Ableitung „revoked-Konten → Snackbars": aus einer Verbindungsliste entstehen die richtigen
    Snackbars; Wechsel auf `active` entfernt sie.
- **Integration (Frontend):**
  - Sync liefert 409 → Statusaktualisierung → Snackbar mit dem richtigen Konto erscheint.
  - Nach Reconnect (Status `active`) verschwindet die Snackbar.
- **Aufräumen:** entfernte Banner-Tests löschen; `AppShell`/`App`-Tests an die neue Struktur
  anpassen.
- `npm run check` (tsc + eslint `--max-warnings 0` + dependency-cruiser + coverage) muss grün sein.

## Nicht im Umfang (YAGNI)

- Kein Hintergrund-Scheduler / Auto-Sync (bewusst nicht gewollt).
- Kein echtes Browser-Popup-Fenster (`window.open`) für OAuth — Full-Page-Redirect genügt.
- Kein `login_hint` (siehe Abschnitt 5).
- Keine generische Toast-Nutzung über Google-Reconnect hinaus; die Infrastruktur ist zwar
  wiederverwendbar angelegt, wird aber nur vom Kalender-Sync gefüttert.

## Betroffene Dateien (Orientierung)

- **Entfernen:** `frontend/src/features/google/ConnectionRevokedBanner.tsx` (+ Test).
- **Ändern:** `frontend/src/routing/AppShell.tsx` (Banner raus, SnackbarProvider rein),
  `frontend/src/features/calendar/useCalendarSync.ts` (Verbindungs-Query nach Sync invalidieren),
  zugehörige Tests.
- **Neu:** `SnackbarProvider` (Context + UI), Reconnect-Dialog, Hook „revoked → Snackbar".
- **Unverändert:** Backend, `api/openapi.yml`, `GoogleAccountsSettings`.
