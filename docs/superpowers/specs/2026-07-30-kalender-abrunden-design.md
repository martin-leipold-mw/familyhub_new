# Design: Kalender abrunden — Agenda, Erinnerungen, Serientermine

**Datum:** 2026-07-30
**Status:** Genehmigt
**Build-Order-Stufe:** 4 (Nachzügler) — schließt offene `FA-KAL`-Anforderungen der Kalenderansicht

## Kontext

Stufe 4 (Kalenderansicht Woche + Tag) ist auf `main` gemerged. Diese Runde rundet die
Kalenderansicht ab, bevor Stufe 5 (Tasks) beginnt.

Die „Status"-Spalte in `docs/concept/02-funktionale-anforderungen.md` (Kap. 4) ist gegenüber
dem aktuellen Code **veraltet**. Verifizierter Ist-Stand am Code:

- ✅ `FA-KAL-19` Sync aller verbundenen Mitglieder — erledigt (`useCalendarSync.ts`)
- ✅ `FA-KAL-25` Ort + Beschreibung im Dialog — erledigt (`EventDialog.tsx`)
- ✅ `FA-KAL-27` Mitglied beim Bearbeiten änderbar — erledigt (`MemberSelect` ohne `disabled`)
- ✅ `FA-KAL-21` **Tagesansicht** — erledigt (`DayGrid`, Umschalter Woche/Tag)

Verbleibender, hier adressierter Rest-Backlog:

| Req | Feature | Prio | Contract? |
|-----|---------|------|-----------|
| `FA-KAL-21` | Agenda-/Listenansicht (Monatsansicht bleibt offen) | SOLL | nein |
| `FA-KAL-23` | Erinnerungen | SOLL | ja |
| `FA-KAL-22` | Serientermine | SOLL | ja |

**Bewusst außerhalb dieser Runde:** Monatsansicht (`FA-KAL-21`), Drag & Drop (`FA-KAL-24`, KANN),
natürlichsprachige Eingabe (`FA-KAL-26`, Parser existiert nicht), sowie bei Serienterminen der
Fall „Diesen und alle folgenden" und Instanz-Ausnahmen (Variante C).

### Verifizierter technischer Ausgangspunkt

- Der Sync holt Events mit `GoogleCalendarClient.listEvents(...).setSingleEvents(true)` — Google
  **expandiert Serien in Einzel-Instanzen**. Die RRULE selbst wird nie gespeichert; nur Googles
  `recurringEventId` liegt als `Event.recurrenceId` im Mirror (`Event.kt:42`).
- Schreibpfad `EventService.create/update` → `EventMapper.toGoogleEvent(EventCommand)` setzt heute
  **weder** `recurrence` **noch** `reminders`.
- Der API-Contract (`api/openapi.yml`, `EventCreateRequest`/`EventResponse`) kennt weder
  `recurrenceRule`, `recurringEventId` noch Reminder-Felder.

### Getroffene Grundsatzentscheidungen

| Thema | Entscheidung |
|-------|-------------|
| Zuschnitt | Drei **unabhängig auslieferbare Inkremente** in einem Spec, in dieser Reihenfolge: Agenda → Erinnerungen → Serientermine |
| Agenda-Bereich | Rollend ab heute, festes Fenster **30 Tage**, nach Tag gruppiert, leere Tage übersprungen |
| Erinnerungen | **Eine** Erinnerung pro Termin aus Preset-Liste; wird am Google-Event gespeichert. FamilyHub benachrichtigt **nicht** selbst |
| Serientermine | Variante **B**: Anlegen einfacher Wiederholungen + „Serie"-Badge + Scope-Abfrage „Nur diesen Termin / Ganze Serie" bei Bearbeiten/Löschen |
| Serien-RRULE-Speicherung | **Kein** neues RRULE-Feld im Mirror. Elternserie wird zum Prefill **on-demand** von Google geholt (Schreiben braucht ohnehin Google-Konnektivität) |

Ein Feature gilt erst als fertig, wenn es **über die UI erreichbar ist, Tests grün sind und CI grün ist**.

---

## Inkrement 1 — Agenda-/Listenansicht (`FA-KAL-21`, nur Frontend)

Kein Contract-Bruch, keine Backend-Änderung. Datenquelle ist der vorhandene
`useCalendarEvents`-Hook.

- **Umschalter:** `CalendarViewMode` (in `dates.ts`) um `'agenda'` erweitern; `CalendarHeader`
  bekommt den dritten Umschalt-Button „Agenda".
- **Zeitraum:** Im Agenda-Modus lädt `CalendarView` einen festen Bereich **heute … heute + 30 Tage**
  (statt der wochen-/tagesbasierten Ankerlogik). `dates.ts` erhält dafür eine Hilfsfunktion, die
  für `view === 'agenda'` diesen Bereich liefert; die vorhandenen `periodLabel`/`shiftAnchor`-Pfade
  bleiben für Woche/Tag unverändert.
- **Navigation:** „Heute" springt an den Listenanfang (Scroll nach oben). Vor/Zurück-Buttons werden
  im Agenda-Modus **ausgeblendet** (das rollende 30-Tage-Fenster hat keine sinnvolle Seiten-Semantik).
  `CalendarHeader` blendet Prev/Next abhängig vom `view` aus.
- **Neue Komponente `AgendaList`** (analog zu `WeekGrid`/`DayGrid`, gleiche `gridProps`):
  - Termine chronologisch nach Tag gruppiert; **leere Tage werden übersprungen**.
  - Pro Tag ein Header: Datum + Wochentag in deutscher Kurzform; Heute-Hervorhebung wie in den Grids.
    Feiertagsmarkierung ist optional und kein Muss dieser Runde.
  - Pro Termin eine Zeile: Zeit (`HH:mm–HH:mm`) bzw. „Ganztägig", Titel, Mitglieds-Farbe/-Avatar.
    Ganztägige/mehrtägige Termine erscheinen an jedem betroffenen Tag im Fenster.
  - Antippen einer Zeile öffnet den bestehenden `EventDialog` (`onEventClick`).
  - Leerer Zustand: „Keine Termine in den nächsten 30 Tagen."
- **Tests:** Unit für die Datums-Hilfsfunktion (Fenstergrenzen), `AgendaList` (Gruppierung,
  leere Tage übersprungen, Ganztag-Darstellung, Klick öffnet Dialog), `CalendarHeader`
  (Agenda-Button, Prev/Next ausgeblendet).

---

## Inkrement 2 — Erinnerungen (`FA-KAL-23`, Contract + Backend + Frontend)

Drei Zustände sauber abgebildet und 1:1 auf Google `reminders` gemappt:
*Standard des Kalenders* / *Keine* / *N Minuten vorher*.

### Contract (`api/openapi.yml`)

`EventCreateRequest` **und** `EventResponse` erhalten additiv:

```yaml
reminderUseDefault:
  type: boolean
  default: true
reminderMinutes:
  type: integer
  nullable: true
```

Semantik: `useDefault=true` → Kalender-Standard (`reminderMinutes` ignoriert). `useDefault=false,
reminderMinutes=null` → keine Erinnerung. `useDefault=false, reminderMinutes=N` → Popup N Minuten
vorher. Additiv mit Default ⇒ kein oasdiff-Breaking-Change.

### Datenbank

Migration **`V9__event_reminders.sql`**: Spalten `reminder_use_default BOOLEAN NOT NULL DEFAULT true`
und `reminder_minutes INTEGER` auf Tabelle `events`. (Nie eine angewandte Migration editieren.)

### Backend

- `Event`-Entity: Felder `reminderUseDefault`, `reminderMinutes`.
- `EventCommand`/`CreateEventCommand`: dieselben Felder; `EventService` reicht sie durch.
- `EventMapper.toGoogleEvent`: setzt `googleEvent.reminders`:
  - `useDefault=true` → `Reminders().setUseDefault(true)`
  - sonst → `setUseDefault(false).setOverrides(minutes!=null ? [EventReminder("popup", minutes)] : [])`
- **Lesepfad** (Sync, `EventMapper` von Google → Entity): Googles `reminders` in den Mirror
  übernehmen (`useDefault`; erster `popup`-Override → `reminderMinutes`), damit der Bearbeiten-Dialog
  korrekt vorbelegt.
- `EventView`/`toView` und Response-Mapping um beide Felder ergänzen.

### Frontend

- `EventDialog`: Dropdown „Erinnerung" mit Presets → *Standard des Kalenders* / *Keine* /
  *10 Minuten* / *30 Minuten* / *1 Stunde* / *1 Tag vorher*. Mapping Auswahl ↔
  (`reminderUseDefault`, `reminderMinutes`) in einer kleinen reinen Hilfsfunktion (testbar).
- Prefill aus `initial` beim Bearbeiten.

### Tests

- Backend: Mapper Reminder ↔ Google (alle drei Zustände), Lesepfad speichert Reminder; Integration
  Create/Update mit Reminder.
- Frontend: Mapping-Hilfsfunktion (beide Richtungen), Dialog zeigt/speichert die Auswahl.

---

## Inkrement 3 — Serientermine (`FA-KAL-22`, Variante B, Contract + Backend + Frontend)

### Contract (`api/openapi.yml`)

- `EventCreateRequest.recurrenceRule: string, nullable` — **eine** RRULE (z. B.
  `RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=1;UNTIL=20261231`), vom Frontend gebaut, Backend reicht sie
  an `googleEvent.setRecurrence(listOf(rule))` durch.
- `EventResponse.recurringEventId: string, nullable` — aus vorhandenem `Event.recurrenceId`; erlaubt
  Badge und Serien-Scope-Abfrage im Frontend.
- Scope-Parameter **`scope`** (`enum: [instance, series]`, Default `instance`) als Query-Parameter
  auf **`PUT /events/{id}`** und **`DELETE /events/{id}`**.
- Neuer Endpoint **`GET /events/{id}/series`** → liefert die Elternserie inkl. gefüllter
  `recurrenceRule` (on-demand von Google), zum Prefill beim „Ganze Serie"-Bearbeiten.

Alle Feld-Ergänzungen sind additiv; der `scope`-Parameter ist optional mit Default ⇒ kein
Breaking-Change.

### Backend

- **Anlegen:** `EventCommand` um `recurrenceRule` erweitern; `toGoogleEvent` setzt bei Nicht-`null`
  die Recurrence. Google gibt beim Create den **Master** zurück; die erste Instanz erscheint sofort,
  die weiteren nach dem nächsten Sync (Google expandiert via `singleEvents=true`).
- **`GET …/series`:** Event laden, dessen `recurrenceId` (= Google `recurringEventId`) auflösen,
  Elternevent von Google holen (`buildCalendar(connection).events().get(calendarId, recurringEventId)`),
  Master-Felder + `recurrenceRule` (aus `getRecurrence()`) zurückgeben.
- **Bearbeiten/Löschen mit `scope=series`:** Ziel-ID ist die `recurringEventId` statt der Instanz-ID.
  - Löschen: `deleteEvent(connection, calendarId, recurringEventId)`.
  - Bearbeiten: Master von Google holen, geänderte gemeinsame Felder (Titel, Uhrzeit-of-day, Ort,
    Beschreibung, Reminder, `recurrenceRule`) anwenden, `updateEvent` auf den Master.
  - `scope=instance` (Default): heutiges Verhalten unverändert.
- Nach Serien-Schreiboperationen ist ein Re-Sync bzw. Invalidierung nötig, damit der Mirror die
  expandierten Instanzen aktualisiert (Frontend invalidiert Event-Query analog zum bestehenden Sync).

### Frontend

- **RRULE-Builder** (reine, testbare Funktion) baut aus der UI die RRULE:
  - *Wiederholung*: Keine / Täglich / Wöchentlich / Monatlich / Jährlich → `FREQ`
  - *Intervall* „alle N …" → `INTERVAL` (Default 1)
  - bei *Wöchentlich*: *Wochentage* (Mo–So, Default = Wochentag des Termins) → `BYDAY`
  - *Ende*: Nie / Am (Datum) → `UNTIL` / Nach (N Terminen) → `COUNT`
  - Gegenrichtung (RRULE → UI-Zustand) für den Serien-Prefill.
- **`EventDialog` (Anlegen):** Recurrence-Abschnitt mit obigen Feldern (nur im Create-Modus für neue
  Serien sichtbar).
- **Anzeige:** Instanzen mit `recurringEventId` erhalten ein „🔁 Serie"-Badge in `EventBlock`
  (Woche/Tag) und in der Agenda-Zeile.
- **Bearbeiten/Löschen:** Trägt der Termin eine `recurringEventId`, zeigt der Dialog die
  Scope-Auswahl **„Nur diesen Termin" / „Ganze Serie"**. Bei „Ganze Serie" + Bearbeiten wird über
  `GET …/series` vorbelegt; PUT/DELETE werden mit `scope=series` gesendet. Ohne `recurringEventId`
  bleibt der Ablauf wie heute.

### Tests

- Backend: Mapper RRULE ↔ Google; `GET …/series` löst Elternserie auf; PUT/DELETE mit `scope=series`
  adressieren die `recurringEventId`; `scope=instance` bleibt unverändert.
- Frontend: RRULE-Builder (beide Richtungen, alle Frequenzen + Ende-Varianten), Badge-Anzeige,
  Scope-Dialog steuert die Mutationen korrekt.
- **e2e-Ergänzung:** Serie anlegen → Badge sichtbar → „Ganze Serie löschen" entfernt alle Instanzen.

---

## Contract-first-Reihenfolge (je Contract-Feature)

`api/openapi.yml` bearbeiten → `openApiGenerate` (Backend-Interfaces) + `orval` (Frontend-Client)
regenerieren → Backend-Implementierung → Frontend-Implementierung → `scripts/pre-commit-check.sh`
(spiegelt CI). Generierte Clients nie von Hand editieren.
