# Design: Schritt 4 — Kalenderansicht (Woche + Tag)

**Datum:** 2026-07-27
**Status:** Genehmigt
**Build-Order-Stufe:** 4 von 10

## Kontext

Stufe 1–3 sind abgeschlossen: Scaffold/CI/DB/Security, Familienmitglieder/Settings/PIN/Setup-Wizard sowie die vollständige Google-Anbindung (OAuth + Kalender-Sync, Events lesen **und** schreiben, lokaler Spiegel). Das Backend bietet bereits vollständiges Event-CRUD (`/v1/events`, `/v1/events/{id}`), Kalenderauswahl und manuellen Sync (`/v1/google/calendars/sync`). Im Frontend existiert bisher **keine** Kalenderansicht — die Route `/` zeigt aktuell direkt die Einstellungen.

Stufe 4 baut die **Kalender-UI im Frontend**. Es ist ein überwiegend frontend-lastiger Sprint, weil die API steht. Fachliche Grundlage: `docs/concept/02-funktionale-anforderungen.md`, Kapitel 4 (`FA-KAL-01` … `FA-KAL-24`). Die „Umgesetzt"-Spalte dort beschreibt das **Altsystem**; diese Spec beschreibt den **Neubau** und weicht dort bewusst ab, wo das Altsystem Schwächen hatte (insb. `FA-KAL-19`).

Visueller Nordstern ist ein wandmontiertes Familien-Display im Stil von Skylight Calendar: Farbe pro Familienmitglied als primärer Ordnungsschlüssel, große kontrastreiche „glanceable" Darstellung aus 1–3 m, Tag/Woche-Umschalter. Alle Termine aller Mitglieder erscheinen gemeinsam farbcodiert im Raster (kein Mitglieds-Filter).

### Getroffene Grundsatzentscheidungen

| Thema | Entscheidung |
|-------|-------------|
| Zuschnitt | **Woche + Tag, schlank** — nur MUSS-Kern in beiden Ansichten |
| App-Shell | Minimale Shell: Kalender wird Startseite `/`, Einstellungen ziehen nach `/settings`, erreichbar per Zahnrad. Struktur für spätere Bereiche (Aufgaben/Haushalt/Fotos) vorbereitet, aber jetzt nicht verdrahtet |
| Termindarstellung | Alle Mitglieder gemeinsam, farbcodiert nach Mitglieds-Farbe; kein Mitglieds-Filter |
| Datumsbibliothek | `date-fns` + `de`-Locale neu einführen (Wochenberechnung, deutsches Format) |
| Sync-Auslöser | Manueller Sync-Button synchronisiert **alle verbundenen Mitglieder** (behebt `FA-KAL-19`: Altsystem synchronisierte nur das erste Mitglied) |
| Anlegen | Dialog mit Pflicht-Mitgliedsauswahl (bestimmt Farbe + Ziel-Kalender); ohne Serientermine/Erinnerungen |

### Bewusst außerhalb Stufe 4

Wetter (`FA-KAL-14`, → Stufe 9), Feiertage (`FA-KAL-13`), mehrtägige Balken (`FA-KAL-12`), abwechselnde Farbvarianten bei Überlappung (`FA-KAL-08`), Avatar-Leiste (`FA-KAL-15`), Serientermine (`FA-KAL-22`), Erinnerungen (`FA-KAL-23`), Drag & Drop (`FA-KAL-24`), sowie Monats- und Agenda-Ansicht (`FA-KAL-21`).

---

## 1. App-Shell & Routing

Neuer Layout-Rahmen `AppShell` mit fester Kopfzeile. Änderungen an `App.tsx`:

| Route | Vorher | Nachher |
|-------|--------|---------|
| `/` | `SettingsView` (hinter `SetupGuard`) | **`CalendarView`** (hinter `SetupGuard`, innerhalb `AppShell`) |
| `/settings` | — | **`SettingsView`** (hinter `SetupGuard`, innerhalb `AppShell`) |
| `/setup` | `SetupWizard` | unverändert |
| `/oauth/callback` | `OAuthCallback` | unverändert |

Die Kopfzeile (`CalendarHeader`) enthält:
- Aktueller Zeitraum in deutscher Kurzform `MMM yyyy` (`FA-KAL-05`), z. B. „Juli 2026"
- Ansichts-Umschalter **Tag | Woche** (segmentierte Schaltfläche, Touch ≥ 44 px)
- Vor/Zurück-Pfeile (blättern je nach Ansicht wochen- bzw. tageweise, `FA-KAL-03`)
- „Heute"-Button (springt zur aktuellen Woche/zum aktuellen Tag, `FA-KAL-04`)
- Sync-Button (⟳)
- Zahnrad (⚙) → `/settings`

`AppShell` ist so aufgebaut, dass später eine Bereichsnavigation (Aufgaben/Haushalt/Fotos) ergänzt werden kann, ohne die Kalender-Kopfzeile umzubauen. In Stufe 4 wird nur Kalender ↔ Einstellungen verdrahtet.

## 2. Feature-Slice `frontend/src/features/calendar/`

```
calendar/
  CalendarView.tsx        # Container: State (view: 'week'|'day', anchorDate), Datenladen, Dialog-Steuerung
  CalendarHeader.tsx      # Kopfzeile: Zeitraum-Label, Umschalter, Navigation, Sync, Zahnrad
  WeekGrid.tsx            # 7 Spalten Mo–So + Ganztags-Zeile + Zeitraster
  DayGrid.tsx             # 1 Spalte, nutzt dieselben TimeGrid-Bausteine
  TimeGrid.tsx            # Gemeinsames Zeitraster 06–22, Stundenlinien, 50 px/h
  AllDayRow.tsx           # Ganztags-Zeile über dem Raster (FA-KAL-11)
  EventBlock.tsx          # Positionierter Termin-Block in Mitglieds-Farbe
  CurrentTimeLine.tsx     # Rote „Jetzt"-Linie, 60-Sekunden-Takt
  EventDialog.tsx         # Anlegen / Bearbeiten / Löschen
  MemberSelect.tsx        # Farbige Mitgliedsauswahl im Dialog
  useCalendarEvents.ts    # Query-Hook: sichtbarer Zeitraum → orval listEvents
  useCalendarSync.ts      # Sync über alle verbundenen Mitglieder + Refetch
  layout.ts               # Reine Positions-Mathematik (ohne DOM, voll testbar)
  dates.ts                # Zeitraum-/Wochenberechnung, deutsche Formatierung (date-fns)
```

Mitglieds-Farben werden aus dem bestehenden `frontend/src/features/members/colors.ts` (`MEMBER_COLORS`, HSL) **wiederverwendet** — keine zweite Farbquelle.

## 3. Raster-Mathematik (`layout.ts`, rein & testbar)

Konstanten aus dem Konzept (`FA-KAL-02`):
- Raster **06:00–22:00** = 16 Stunden × **50 px** = **800 px** Höhe.
- `START_HOUR = 6`, `END_HOUR = 22`, `HOUR_PX = 50`.

Positionsberechnung je zeitgebundenem Termin:
- `top = (startStunde − 6) · 50 + (startMinute / 60) · 50`
- `height = max(dauerInStunden · 50, MIN_BLOCK_PX)` — Mindesthöhe für Antippbarkeit/Lesbarkeit.
- Termine, die vor 06:00 beginnen oder nach 22:00 enden, werden auf den sichtbaren Bereich **geklemmt**.

Überlappung (`FA-KAL-07`): Termine eines Tages, deren Zeitfenster sich überschneiden, werden in nebeneinanderliegende Spalten gruppiert und teilen die verfügbare Breite **gleichmäßig** (`width = 100 % / anzahlSpalten`, `left = spaltenIndex · width`). Abwechselnde Hell/Dunkel-Varianten (`FA-KAL-08`) sind bewusst nicht Teil dieser Stufe.

Ganztägige bzw. mehrtägige Termine werden nicht ins Zeitraster einsortiert, sondern in die `AllDayRow` (siehe §4). Mehrtägige Balken über mehrere Spalten (`FA-KAL-12`) sind nicht Teil dieser Stufe — ein ganztägiger Termin erscheint an seinem/seinen Tag(en) je als eigener Chip in der Ganztags-Zeile.

`layout.ts` kennt **kein** React/DOM und liefert reine Zahlen/Objekte, damit die Mathematik isoliert unit-getestet werden kann.

## 4. Wochen- und Tagesansicht

**Wochenansicht (`WeekGrid`)** — 7 Spalten Montag–Sonntag (`FA-KAL-01`):

```
┌ Juli 2026 ───────────────── [Tag|Woche] [‹] [Heute] [›]  [⟳] [⚙] ┐
│         Mo 21  Di 22  Mi 23  Do 24  Fr 25  Sa 26  So 27          │
│ Ganztag │      [Urlaub Papa]                                     │
├─────────┼─────────────────────────────────────────────────────  │
│ 06      │                                                        │
│ 07      │        ┌─────┐                                         │
│ 08      │        │Anna │  ┌────┐                                 │
│ 09 ─────┼────────│Schule│─│Papa│───── ← rote Jetzt-Linie          │
│ 10      │        └─────┘  └────┘                                 │
│  …      │                              (heute = blauer Hintergr.)│
│ 22      │                                                        │
└─────────┴─────────────────────────────────────────────────────  ┘
```

- Der heutige Tag wird farblich hervorgehoben (`FA-KAL-10`, blauer Spaltenhintergrund + blaue Tageszahl).
- `CurrentTimeLine`: rote horizontale Linie an der aktuellen Uhrzeit, Aktualisierung im 60-Sekunden-Takt, **keine** Linie außerhalb 06:00–22:00 (`FA-KAL-09`).

**Tagesansicht (`DayGrid`)** — eine Spalte, dieselben `TimeGrid`-Bausteine, breiter mit größeren Blöcken (bessere Antippbarkeit aus Distanz). Umschalter (`view`) und `anchorDate` liegen im Component-State von `CalendarView`; Navigation blättert in der Tagesansicht tageweise, in der Wochenansicht wochenweise.

## 5. Datenladen (`useCalendarEvents.ts`)

- Aus `anchorDate` + `view` wird der sichtbare Zeitraum berechnet (`dates.ts`): Woche = Montag 00:00 bis Sonntag 23:59; Tag = 00:00–23:59.
- Aufruf des generierten orval-Hooks `listEvents` mit `start`/`end`. Query-Key enthält den Zeitraum, sodass Blättern neue Daten lädt und TanStack Query cached.
- Ergebnis wird nach `layout.ts` in Positions-Objekte transformiert und an `WeekGrid`/`DayGrid` gereicht.

## 6. Termin-Dialog (`EventDialog.tsx`)

Vollflächiges, touch-freundliches Modal. Felder:

| Feld | Pflicht | Bemerkung |
|------|---------|-----------|
| Titel | ja | |
| Mitglied | ja | Farbige Auswahl (`MemberSelect`); bestimmt Farbe + Ziel-Kalender (`memberId`) |
| Ganztag-Schalter | — | steuert Zeit- vs. Datumsfelder |
| Datum | ja | |
| Start-/Endzeit | bei nicht-ganztägig | |
| Ort | nein | |
| Beschreibung | nein | |

- Anlegen → `createEvent` (POST `/v1/events`); Bearbeiten → `updateEvent` (PUT `/v1/events/{id}`); Löschen → `deleteEvent` mit Bestätigungsschritt (`FA-KAL-16/17/18`).
- Antippen eines `EventBlock` öffnet Bearbeiten; Antippen einer leeren Rasterzelle öffnet Anlegen mit vorbelegtem Datum/Uhrzeit.
- Bei Erfolg wird die Events-Query invalidiert; das Modal schließt.
- **Bewusst weggelassen:** Serientermine (`recurrenceRule`), Erinnerungen (`reminderMinutes`).

## 7. Sync, Lade- und Fehlerzustände

- **Sync (`useCalendarSync.ts`, `FA-KAL-19`):** ermittelt alle Mitglieder mit verbundenem Google-Konto und ruft `/v1/google/calendars/sync` je Mitglied auf; anschließend Events-Refetch. Während des Laufs zeigt der Sync-Button einen Spinner. Damit wird die Altsystem-Schwäche „nur erstes Mitglied" behoben.
- **Laden (`FA-KAL-20`):** dezenter Lade-Zustand im Rasterbereich, während `listEvents` läuft.
- **Fehler (`FA-KAL-20`):** Banner „Fehler beim Laden der Termine" mit Schaltfläche „Erneut versuchen" (löst Refetch aus). Gilt für Lade- und Sync-Fehler.

## 8. UI-Konventionen

Es gelten die Projektkonventionen: deutschsprachige Oberfläche durchgehend, Touch-Ziele ≥ 44 × 44 px, keine hover-only-Interaktionen, große Schrift/hoher Kontrast (Sichtdistanz 1–3 m). Datum/Uhrzeit/Wochentage im deutschen Format (`FA-ALLG-03`) via `date-fns` `de`-Locale.

## 9. Testansatz (TDD)

- **Unit (`layout.ts`, `dates.ts`):** Block-Position (top/height), Klemmung außerhalb 06–22, Überlappungs-Spalten-Split, Zeitraum-Berechnung Woche/Tag, Jetzt-Linien-Platzierung (inkl. „keine Linie außerhalb 06–22"), deutsche Formatierung.
- **Component (vitest + Testing Library):** Ansichts-Umschalter wechselt Woche↔Tag, Navigation/„Heute" ändert Zeitraum-Label, Dialog-Validierung (Titel/Mitglied Pflicht), Farb-Zuordnung nach Mitglied, Fehler-Banner + Retry, Ganztags-Chip in `AllDayRow`.
- **E2E (Playwright):** Kalender öffnen → Termin anlegen → im Raster sichtbar → bearbeiten → löschen.

Alle Gates müssen grün sein (`npm run check`: `tsc`, eslint `--max-warnings 0`, dependency-cruiser, Coverage). Ein Feature gilt erst als fertig, wenn es über die UI erreichbar ist, Tests grün sind und CI besteht.

## 10. Betroffene/neue Dateien (Überblick)

- **Neu:** `features/calendar/*` (siehe §2), `features/calendar/*.test.ts(x)`, ein Playwright-E2E-Spec.
- **Geändert:** `App.tsx` (Routing + `AppShell`), neue `AppShell`-Komponente, `frontend/package.json` (`date-fns`).
- **Wiederverwendet:** `features/members/colors.ts`, generierte orval-Hooks unter `src/api/generated/`, `SetupGuard`.
- **Backend:** keine Änderungen erwartet (Event-CRUD, Kalenderauswahl, Sync stehen). Sollte sich beim Sync-über-alle-Mitglieder eine Lücke zeigen (z. B. fehlende Liste verbundener Mitglieder), wird das gesondert bewertet — nicht Teil dieser Spec.
