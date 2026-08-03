# Mehrere Google-Konten & korrekte Kalenderfarben — Design

**Datum:** 2026-08-03
**Status:** Umgesetzt (siehe docs/superpowers/plans/2026-08-03-multi-account-calendar-colors.md)
**Betrifft:** `FA-KAL` (Kalender), Google-Integration (Sprint 3+)

## Problem

Im Kalender erscheinen alle Termine unter einem einzigen Konto und in einer
einzigen Farbe. Ein zweites verbundenes Google-Konto wird nicht korrekt
gezogen, und geteilte Kalender (Feiertage, Geburtstage) sind nicht von
persönlichen Kalendern unterscheidbar.

### Ursachenanalyse (im Code verifiziert)

1. **Setup-Assistent behandelt nur das erste Konto.**
   `frontend/src/features/setup/CalendarSelectStep.tsx:7` ist fest auf
   `connections[0]` verdrahtet. Ein im Setup verbundenes zweites Konto bekommt
   nie eine Kalenderauswahl.

2. **Kalender-Entdeckung läuft nur beim UI-Aufruf, nicht im Scheduler.**
   `CalendarSyncService.refreshCalendars(connection)` — legt die
   `calendar_subscriptions`-Zeilen an — wird ausschließlich von
   `CalendarQueryService.listForMember()` (`:33`) aufgerufen. Der geplante Sync
   (`CalendarSyncScheduler`, `CalendarSyncService.syncAll`) ruft es nie auf und
   iteriert nur über bereits **ausgewählte** Subscriptions
   (`findAllByConnectionIdAndIsSelectedTrue`, `CalendarSyncService.kt:72`). Ein
   Konto, dessen Kalender nie im UI angezeigt/ausgewählt wurden, synchronisiert
   null Events.

3. **Geteilte Kalender kollidieren auf einen Besitzer.** Die `events`-Tabelle
   ist eindeutig über `(google_event_id, google_calendar_id)`
   (`V7__events.sql:22`) — ohne Verbindung/Mitglied. Der Update-Zweig in
   `CalendarSyncService.syncSubscription` (`:122–145`) aktualisiert
   `ownerMemberId`/`subscriptionId` nicht. Wer einen geteilten Termin zuerst
   synct, „besitzt" ihn dauerhaft → alle geteilten Termine erscheinen in der
   Farbe von Konto #1.

4. **OAuth erzwingt keine Kontoauswahl.** `GoogleOAuthFlow.kt:56` setzt
   `prompt=consent`, nicht `select_account`. Bei nur einem im Browser
   eingeloggten Google-Konto verbindet Google still dasselbe Konto erneut; es
   entsteht kein zweites Mitglied.

5. **Farben werden pro Mitglied vergeben, nicht pro Kalender.**
   `frontend/src/features/calendar/WeekGrid.tsx:24` färbt jedes Event über
   `memberColorHex(m.color)` anhand von `event.memberId`. Die echte
   Google-Kalenderfarbe (`calendar_subscriptions.background_color`) wird zwar
   gesynct, aber nur als Farbkästchen in „Kalender verwalten" angezeigt — sie
   färbt keine Events. Folge: Alle Events eines Kontos haben dieselbe Farbe;
   mehrere Kalender eines Kontos sind nicht unterscheidbar.

## Ziele

- Jedes verbundene Konto kann **mehrere** Kalender synchronisieren; genau
  **einer** ist der **Primärkalender** (Schreibziel neuer Termine).
- **Farbe pro Kalender:** Persönliche Kalender eines Kontos erben die
  **Kontofarbe** (Mitglieds-Palette). **Geteilte/Familien**-Kalender bekommen je
  eine **eigene, abweichende** Farbe.
- „Geteilt/Familie" wird **manuell** pro Kalender markiert.
- Der geplante Sync zieht die Kalender **aller** aktiven Konten zuverlässig,
  auch ohne vorherigen UI-Besuch.

### Nicht-Ziele (YAGNI)

- Keine frei wählbare Farbe pro Kalender (geteilte Farben sind deterministisch
  aus einer Palette).
- Keine mehreren Google-Konten pro Familienmitglied (weiterhin 1 Konto = 1
  Mitglied).
- Keine Änderung an der Recurrence-/Reminder-Logik.

## Grundlegende Design-Entscheidung: Farbe wird im Backend aufgelöst

**Architektur A (gewählt):** Das Backend löst die Farbe **je Kalender** auf und
liefert eine Kalender-Liste mit fertiger Hex-Farbe. Das Frontend färbt Events
über ihre `calendarId`.

Verworfene Alternativen:
- **B — Farbe pro Event beim Sync speichern:** dupliziert Daten; jede
  Farbänderung erfordert Re-Sync.
- **C — Frontend rechnet aus Subscriptions + Mitgliedern:** verlagert Logik in
  den Client und driftet leicht vom Backend ab.

Vorteil A: eine Quelle der Wahrheit; eine geänderte Markierung (geteilt/primär)
wirkt sofort, ohne Events neu zu synchronisieren.

## Datenmodell (Flyway `V10`)

`calendar_subscriptions` erhält zwei Flags:

```sql
-- V10: shared/write-target flags per calendar subscription
ALTER TABLE calendar_subscriptions
    ADD COLUMN is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_write_target BOOLEAN NOT NULL DEFAULT FALSE;

-- Genau ein Schreibziel je Verbindung
CREATE UNIQUE INDEX idx_calendar_subscriptions_write_target
    ON calendar_subscriptions (connection_id) WHERE is_write_target = TRUE;
```

- `is_shared` — manuell markiert „geteilt/Familie". Steuert die Farbquelle.
- `is_write_target` — der Primärkalender des Kontos (Schreibziel neuer Termine).
  Genau einer je Verbindung (Teil-Unique-Index). Migration setzt initial den
  bestehenden Google-Primärkalender (`is_primary = TRUE`) je Verbindung als
  Schreibziel; dort wo keiner existiert, bleibt es dem ersten
  Speichervorgang/Backfill überlassen.

**Keine Farbspalte.** Persönliche Kalender leiten die Farbe vom Mitglied ab;
geteilte Kalender bekommen eine deterministische Palettenfarbe (siehe unten).

## Farb-Auflösung (Backend)

Neue Funktion `resolveCalendarColor(subscription) -> hex`:

- `is_shared == true` ⇒ Farbe aus einer eigenen **Shared-Palette**,
  deterministisch gewählt: geteilte Kalender werden global stabil sortiert
  (z. B. nach `google_calendar_id`), der Index bestimmt die Palettenfarbe.
  Dadurch hat derselbe geteilte Kalender bei **beiden** Konten dieselbe Farbe.
  Die Shared-Palette liegt in einem farblich klar von der Mitglieds-Palette
  abgesetzten Bereich (damit „nicht Person" sofort erkennbar ist).
- sonst ⇒ Farbe des Konto-Mitglieds: `connection.familyMemberId` →
  `member.color` → Mitglieds-Palette (`MEMBER_COLORS`).

Die Mitglieds-Palette bleibt Single Source of Truth für Personenfarben; die
Shared-Palette wird als zweite, getrennte Konstante ergänzt (Backend und
Frontend teilen dieselben Hex-Werte, wie schon bei `MEMBER_COLORS`).

## API (`api/openapi.yml`)

Neue/erweiterte, aggregierte Kalender-Sicht über **alle** Verbindungen. Ein
Kalender-Eintrag liefert die aufgelöste Farbe mit:

```
GET /api/v1/calendars            -> Liste aller (ausgewählten) Kalender aller Konten
  CalendarResponse += {
    color: string          // aufgelöste Hex-Farbe (Konto- oder Shared-Farbe)
    isShared: boolean
    isWriteTarget: boolean
    ownerMemberId: string
  }
```

Zusätzliche Schreib-Operationen (PIN-geschützt), um Markierungen zu setzen —
entweder als Erweiterung der bestehenden Auswahl-Speicherung oder als eigener
Endpoint:

```
PUT /api/v1/calendars/{calendarId}/flags
  { isShared?: boolean, isWriteTarget?: boolean }
```

Details (ein kombinierter vs. mehrere Endpoints) werden im Implementierungsplan
festgelegt; Vertrag zuerst in `api/openapi.yml`, dann Codegen.

## Sync-Lücken schließen (Backend)

1. **Scheduler entdeckt Kalender je Konto:** `CalendarSyncScheduler` bzw.
   `CalendarSyncService.syncAll`/`syncConnection` ruft **`refreshCalendars(connection)`
   vor** dem Event-Sync auf. Behebt Ursache #2.
2. **Setup über alle Konten:** `CalendarSelectStep` iteriert über **alle**
   `connections` statt `connections[0]` — vorzugsweise durch Wiederverwendung
   der bestehenden `CalendarManagement`/`ConnectionCalendars`-Logik, die bereits
   pro Verbindung rendert. Behebt Ursache #1.
3. **Schreibziel beim Anlegen:** `EventService.create` wählt das Zielkalender-
   Subscription per `is_write_target` statt `firstOrNull { it.isPrimary }`
   (`EventService.kt:121`).
4. **Geteilte Kalender:** Da die Event-Farbe nicht mehr am `ownerMemberId`
   hängt, sondern an der (geteilten) `calendarId`, ist die Besitz-Kollision
   (#3) für die **Darstellung** entschärft — der geteilte Termin bleibt eine
   Zeile mit eigener, konten­unabhängiger Farbe. Ein Schema-Umbau der
   Event-Identität ist damit **nicht** Teil dieses Designs.
5. **OAuth-Kontoauswahl:** `GoogleOAuthFlow.buildAuthorizationUrl` setzt
   `prompt=select_account consent`, damit „Weiteres Konto verbinden"
   zuverlässig ein zweites Konto anbietet. Behebt Ursache #4.

## Frontend

1. **Coloring by calendar:** `WeekGrid`, `DayGrid`, `AgendaList` färben Events
   per `event.calendarId` aus einer `Map<calendarId, color>`, die aus der
   aggregierten Kalender-API stammt, statt per `memberId`. Fallback `#888`
   bleibt.
2. **„Kalender verwalten":** je Kalender zusätzlich
   - Umschalter **„Geteilt/Familie"** (`isShared`),
   - Auswahl **„Primärkalender"** (Radio je Konto, `isWriteTarget`),
   - Farbvorschau aus der aufgelösten `color`.
   Weiterhin PIN-geschützt (bestehendes `hasPinSession`-Gate).
3. Bestehende Auswahl-UI (`ConnectionCalendars`) bleibt der Ort für alle drei
   Flags (ausgewählt / geteilt / primär).

## Tests

**Backend**
- Farb-Auflösung: persönlich → Kontofarbe; geteilt → Shared-Farbe;
  Determinismus (derselbe geteilte Kalender bei zwei Konten = gleiche Farbe).
- Scheduler ruft `refreshCalendars` je aktivem Konto auf; zweites Konto zieht
  Events ohne vorherigen UI-Besuch.
- `EventService.create` schreibt in `is_write_target`.
- Flyway `V10` (Testcontainers): Spalten, Teil-Unique-Index, Backfill des
  Schreibziels.

**Frontend**
- Events werden per `calendarId` eingefärbt; geteilter Kalender in
  Shared-Farbe, persönlicher in Kontofarbe.
- Toggles „Geteilt" / „Primär" rufen die richtigen Mutationen; PIN-Gate greift.

**E2E (Playwright)**
- Zwei Konten verbinden, je einen persönlichen Kalender wählen, einen geteilten
  Kalender markieren → Wochenansicht zeigt drei unterscheidbare Farben; der
  geteilte Kalender erscheint in der Shared-Farbe.

## Betroffene Dateien (Orientierung)

- `backend/src/main/resources/db/migration/V10__calendar_flags.sql` (neu)
- `backend/.../google/calendar/CalendarSubscription.kt` (+2 Felder)
- `backend/.../google/calendar/CalendarSyncService.kt` (Scheduler-Discovery)
- `backend/.../google/sync/CalendarSyncScheduler.kt`
- `backend/.../google/calendar/EventService.kt` (write-target)
- `backend/.../google/calendar/CalendarQueryService.kt` (Aggregat + Farbe)
- `backend/.../google/calendar/` (neue Farb-Auflösung + Shared-Palette)
- `backend/.../google/oauth/GoogleOAuthFlow.kt` (`select_account`)
- `api/openapi.yml` (CalendarResponse-Felder, Flags-Endpoint)
- `frontend/src/features/calendar/{WeekGrid,DayGrid,AgendaList}.tsx`
- `frontend/src/features/members/colors.ts` (+ Shared-Palette)
- `frontend/src/features/google/CalendarManagement.tsx`
- `frontend/src/features/setup/CalendarSelectStep.tsx`

## Offene Punkte für den Implementierungsplan

- Genaue API-Form der Flag-Updates (kombiniert vs. getrennt).
- Sortierschlüssel/Umfang der Shared-Palette (Anzahl Farben, Kollision bei
  vielen geteilten Kalendern → Modulo).
- Reihenfolge/Idempotenz von `refreshCalendars` im Scheduler bei vielen Konten.
