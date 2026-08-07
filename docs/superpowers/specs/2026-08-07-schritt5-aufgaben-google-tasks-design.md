# Design: Schritt 5 — Aufgaben mit Google-Tasks-Abgleich

**Datum:** 2026-08-07
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Umfang:** Ein Spec, vier Phasen (A → B → C → D)
**Referenzen:** `docs/concept/02-funktionale-anforderungen.md` (Kapitel 5, FA-AUF-*),
`docs/concept/04-api-referenz.md` (Kapitel 11), `docs/concept/05-datenmodell.md` (3.6),
`docs/concept/06-google-integration.md` (Kapitel 9)

## Ziel & Motivation

Sprint 5 bringt den zweiten Alltagsnutzen nach dem Kalender: persönliche Aufgaben, gespiegelt
aus Google Tasks und in beide Richtungen abgeglichen. Die Anbindung aus Schritt 3 (OAuth,
Token-Verwaltung, Verbindungszustand) trägt das mit; strukturell ist der Tasks-Sync das
Gegenstück zum Kalender-Sync aus Schritt 4.

Das Altsystem hatte eine Aufgabenansicht, die in den Konzeptdocs als weitgehend „Umgesetzt"
geführt wird — mit drei Mängeln, die diese Neuauflage an der Wurzel behebt statt sie
nachzubauen:

1. **TA-GOO-17 — Datenverlust durch fehlende Pagination.** Der Sync las nur die erste
   Google-Seite (Default 20 Einträge) und löschte anschließend alle lokalen Aufgaben, die nicht
   darauf standen.
2. **TA-GOO-18 — `PUT` statt `PATCH`.** Ein Abhaken schickte einen Vollersatz mit nur gesetztem
   `status` und löschte damit Titel, Notizen und Fälligkeit der Aufgabe bei Google.
3. **FA-AUF-12 — kein Fälligkeitsdatum im Dialog.** Die API konnte es, die Oberfläche bot es
   nicht an.

Zusätzlich fehlt dem aktuellen Stand die Voraussetzung überhaupt: `GoogleOAuthFlow` fordert nur
den Calendar-Scope an. Ohne `https://www.googleapis.com/auth/tasks` kann kein Konto Aufgaben
lesen oder schreiben.

## Umfang

**Enthalten** (MUSS + wichtige SOLL aus FA-AUF): FA-AUF-01 bis -08, -10 bis -15, -17, -20.

**Bewusst nicht enthalten (YAGNI / eigene Themen):**

| Weggelassen | Begründung |
|---|---|
| FA-AUF-09 — freie Zuweisung an ein beliebiges Mitglied | Folgt zwingend aus der Owner-Entscheidung (siehe unten): das Mitglied ergibt sich aus der Google-Verbindung, über die eine Liste synchronisiert wird. Eine davon abweichende Zuweisung wäre ein rein lokaler Zustand ohne Google-Entsprechung. |
| FA-AUF-16 — natürlichsprachige Eingabe | Eigenes Design-Thema (Parser, deutsches Locale, Vorwärtsdatierung). Später auf dem dann bestehenden Aufgaben-Fundament. |
| FA-AUF-18 — Tageszeiten (morgens/nachmittags/abends) | KANN; im Altsystem nur in totem Code vorhanden. |
| FA-AUF-19 — Unteraufgaben | KANN; braucht Mapping von Googles `parent` und eigene Darstellung. |
| Rein lokale Aufgaben ohne Google-Konto | Entscheidung: jede Aufgabe hängt an einer Google-Taskliste. Hält den Sync auf genau einem Pfad. |

**Konsequenz aus den beiden letzten Punkten, ausdrücklich festgehalten:** Die Aufgabenansicht
zeigt nur Mitglieder mit verbundenem Google-Konto. Ein Kind ohne eigenes Konto bekommt in
Sprint 5 keine Aufgabenkarte. Das ist eine bewusste Vereinfachung; sollte sich das im Betrieb
als zu eng erweisen, ist der Nachzug „lokale Aufgaben" additiv möglich
(`google_task_id = NULL`, vom Löschabgleich ausgenommen).

## Getroffene Grundsatzentscheidungen

| Frage | Entscheidung | Verworfene Alternative |
|---|---|---|
| Sync-Architektur | **Kalender-Spiegel**: strukturgleich zu `CalendarSyncService`, Schreiben geht erst zu Google, dann in die DB. Google ist die Wahrheit. | Local-first mit Outbox (`sync_status='pending'`, Retry, Konfliktauflösung) — unverhältnismäßig für ein paar Dutzend Aufgaben. Kein lokaler Spiegel (Direktzugriff auf Google) — verletzt die Kernentscheidung „Anzeige läuft weiter, wenn Google weg ist". |
| Tasks-Scope | `auth/tasks` fest in die Scope-Liste, **plus Erkennung**: fehlt der Scope in `connection.scopes`, gilt die Verbindung als unvollständig berechtigt, und der bestehende Reconnect-Weg wird angeboten. | Incremental Auth (Scope erst bei Bedarf) — variables Scope-Set je Verbindung, mehr Zustandslogik. Scope ohne Erkennung — Nutzer läuft in ein undiagnostizierbares Google-403. |
| Zuweisung | **Owner = Mitglied der Verbindung**, über die die Liste synchronisiert wird. Kein eigenes Zuweisungsfeld. | Textmarker `[ASSIGNED_TO:id:name]` im Notizfeld (Altsystem) — in fremden Google-Clients sichtbarer Rohtext, den jeder kaputt editieren kann. Liste→Mitglied-Mapping in den Einstellungen — mehr Konfigurationsfläche als jetzt gebraucht. |
| Navigation | **Bereichsnavigation im `AppShell`** (Kalender / Aufgaben / Einstellungen) + Route `/tasks`. `AppShell.tsx` ist im Code bereits dafür kommentiert und trägt Sprint 6–9 mit. | Aufgaben als Seitenleiste im Kalender — auf 24″ zu eng, und die Navigation kommt später doch. Route ohne Navigation — auf einem Kiosk-Display ohne Tastatur praktisch unerreichbar, damit nach Projektdefinition nicht „fertig". |

---

## Phase A — Backend: Datenmodell und Google-Client

### Migration `V11__task_lists_and_tasks.sql`

UUID-Schema wie der übrige Neubau (nicht das `SERIAL`-Modell aus den Altsystem-Docs).

**`task_lists`** — Gegenstück zu `calendar_subscriptions`:

| Spalte | Typ | Null | Bemerkung |
|---|---|---|---|
| `id` | `UUID` | nein | PK |
| `connection_id` | `UUID` | nein | FK → `google_connections(id)` ON DELETE CASCADE |
| `google_task_list_id` | `VARCHAR(255)` | nein | ID bei Google |
| `title` | `VARCHAR(255)` | nein | Anzeigename |
| `is_selected` | `BOOLEAN` | nein | Default `false` — neu entdeckte Listen werden nicht ungefragt synchronisiert |
| `is_write_target` | `BOOLEAN` | nein | Default `false` — Zielliste beim Anlegen |
| `created_at`, `updated_at` | `TIMESTAMP` | nein | |

UNIQUE `(connection_id, google_task_list_id)`.

**`tasks`**:

| Spalte | Typ | Null | Bemerkung |
|---|---|---|---|
| `id` | `UUID` | nein | PK |
| `task_list_id` | `UUID` | nein | FK → `task_lists(id)` ON DELETE CASCADE |
| `google_task_id` | `VARCHAR(255)` | nein | |
| `owner_member_id` | `UUID` | nein | Mitglied der Verbindung |
| `title` | `VARCHAR(500)` | nein | |
| `notes` | `TEXT` | ja | |
| `due_date` | `DATE` | ja | **Bewusst `DATE`, nicht `TIMESTAMP`** — Google Tasks kennt keine Uhrzeit; der Uhrzeitanteil in `due` ist laut Google-Doku bedeutungslos. Das Altsystem führte es als Zeitstempel und erzeugte damit die 00:00-UTC-Verwirrung. |
| `status` | `VARCHAR(20)` | nein | CHECK `IN ('pending','completed')`, Default `'pending'` |
| `priority` | `VARCHAR(10)` | ja | CHECK `IN ('low','medium','high')` — **rein lokal**, ohne Google-Entsprechung |
| `completed_at` | `TIMESTAMP` | ja | |
| `etag` | `VARCHAR(255)` | ja | Aus der Google-Antwort, für Diagnose |
| `google_updated` | `TIMESTAMP` | ja | Aus der Google-Antwort, für Diagnose |
| `created_at`, `updated_at` | `TIMESTAMP` | nein | |

UNIQUE `(task_list_id, google_task_id)` — die im Altsystem **fehlende** Unique-Bedingung war dort
ausdrücklich als Risiko vermerkt (`findByGoogleTaskId` wäre bei Duplikaten gescheitert).
Indizes auf `owner_member_id`, `due_date`, `status`.

**Drei Spalten, die das Altsystem hat und die hier bewusst fehlen:**

- **`sync_status`** — könnte nach diesem Design nur je den Wert `'synced'` annehmen (schlägt ein
  Google-Schreibvorgang fehl, wird lokal nichts persistiert). Genau dieses tote Feld ist in den
  Konzeptdocs als Schwäche vermerkt; es wird nicht nachgebaut.
- **`position`** — Googles manuelle Sortierposition. Die Anzeige sortiert nach Fälligkeit bzw.
  Priorität (FA-AUF-17), nicht nach Googles Reihenfolge; das Feld wäre unbenutzt.
- **`google_task_list_id`** — denormalisierte Kopie. `task_list_id` leistet dasselbe, trägt die
  Unique-Bedingung und kann nicht auseinanderlaufen.

### Neues Package `com.familyhub.google.tasks`

Die ArchUnit-Modulgrenzen bleiben gewahrt: das Package hängt an `google.connection`,
`google.token` und `shared.exceptions`, wie `google.calendar` es auch tut.

- **`GoogleTasksClient`** — analog `GoogleCalendarClient`: gleicher `GoogleTokenProvider`,
  gleiche Timeouts (connect 5 s, read 30 s), `setRootUrl(baseUrl)` für WireMock-Tests.
  - `listTaskLists(connection)` — paginiert vollständig über `nextPageToken`.
  - `listTasks(connection, listId)` — `showCompleted=true`, `showHidden=true`,
    `showDeleted=true`, `maxResults=100`, paginiert vollständig. Gibt eine `TaskPage` mit
    `tasks` **und** `complete: Boolean` zurück; `complete=false`, wenn die Paginierung
    abgebrochen ist. **Das ist die Wurzelbehebung von TA-GOO-17.**
  - `insertTask`, `patchTask`, `deleteTask` — **`patch`, nicht `update`**, damit Teiländerungen
    keine Felder bei Google löschen. **Wurzelbehebung von TA-GOO-18.**
  - Neue Gradle-Abhängigkeit `com.google.apis:google-api-services-tasks`. Die exakte
    `v1-rev…`-Version wird beim Implementieren gepinnt (Maven Central ist aus der
    Entwicklungsumgebung heraus nicht erreichbar).

- **`GoogleOAuthFlow`** — `https://www.googleapis.com/auth/tasks` in `scopes`. Konstante
  `TASKS_SCOPE` an einer Stelle, gegen die geprüft wird.

**Phase A endet grün:** `./gradlew check` läuft durch, Migration greift, Client ist gegen
WireMock getestet. Noch keine UI-Wirkung.

---

## Phase B — Backend: Sync, Service, Vertrag

### `TaskSyncService`

Strukturgleich zu `CalendarSyncService`:

- `refreshTaskLists(connection)` — neue Listen anlegen (`is_selected=false`), bestehende im
  Titel aktualisieren, `is_selected`/`is_write_target` **nie** verändern. Listen, die bei Google
  nicht mehr existieren, werden gelöscht; die zugehörigen `tasks` folgen per FK-CASCADE.
- `syncConnection(connection): SyncResult` — überspringt Verbindungen mit `status != "active"`
  und solche **ohne Tasks-Scope** (WARN-Log). Ruft `refreshTaskLists`, synchronisiert dann jede
  Liste mit `is_selected = true`, setzt `connection.lastSyncedAt`.
- `syncTaskList(connection, list)` — Vollabruf (Google Tasks bietet **keinen** `syncToken`, anders
  als der Kalender). Abgleich über `(task_list_id, google_task_id)`:
  - unbekannt → anlegen,
  - bekannt → Felder aus Google überschreiben (**„Google gewinnt"**), **außer `priority`** — die
    ist rein lokal und überlebt jeden Sync,
  - `deleted == true` → lokal löschen,
  - **Löschabgleich (lokal vorhanden, bei Google nicht mehr) nur wenn `page.complete`** ist.
    Sonst: kein Löschen, ERROR-Log.
- `syncAll()` — über alle aktiven Verbindungen.

### `TaskService` (Schreibpfad)

Wie `EventService`: **erst Google, dann persistieren.** Schlägt der Google-Aufruf fehl, wird
lokal nichts geschrieben — es entsteht kein Halbzustand.

- `create` — Zielliste ist die `is_write_target`-Liste der Verbindung, sonst die erste
  ausgewählte; existiert keine, `ValidationException("Keine Ziel-Aufgabenliste vorhanden")`.
- `update` — Teiländerung via `patchTask`. `priority` und `status`-Wechsel auf `completed`
  setzen `completed_at` lokal; `priority` wird **nicht** zu Google geschickt.
- `delete` — Google zuerst, dann lokal.

### `TaskSyncScheduler` (`google/sync/`)

Eigene Komponente neben `CalendarSyncScheduler` — nicht in diese hineingebaut, damit ein
hängender Tasks-Lauf den Kalender nicht blockiert und beide getrennt konfigurierbar bleiben.
Gleiches Muster: `@Scheduled(fixedDelayString = "\${google.sync.tasks-fixed-delay-ms:900000}")`,
`AtomicBoolean`-Reentrancy-Guard, `try/catch` je Verbindung, INFO-Log mit
`created/updated/deleted`.

### `api/openapi.yml`

Alle Änderungen sind **additiv** — kein oasdiff-Breaking-Change, kein `breaking-change`-Label.

| Methode | Pfad | Zweck | Schutz |
|---|---|---|---|
| GET | `/v1/google/task-lists` | Listen; optionaler `memberId`, ohne ihn alle | — |
| POST | `/v1/google/task-lists/selected` | Auswahl speichern | `@RequiresPinSession` |
| POST | `/v1/google/task-lists/sync` | Manueller Sync je `memberId` → `SyncResultResponse` (bestehendes Schema) | — |
| GET | `/v1/tasks` | Optionaler Filter `memberId`; siehe Beschnitt unten | — |
| POST | `/v1/tasks` | Anlegen | — |
| PATCH | `/v1/tasks/{id}` | Teiländerung; Abhaken ist `{"status":"completed"}` | — |
| DELETE | `/v1/tasks/{id}` | Löschen (Google + lokal) | — |

Zwei bewusste Abweichungen von der Kalender-Vorlage:

- **Ein** Listen-Endpunkt mit optionalem `memberId` statt getrennter `/calendars` und
  `/calendars/all`.
- **PATCH** statt PUT, und **keine** eigenen `/complete`- und `/uncomplete`-Endpunkte.
  Teiländerungen sind bei Aufgaben der Normalfall und bilden direkt auf Googles `tasks.patch` ab.

**Kein `status`-Filterparameter.** Die Filterzähler beziehen sich auf den Gesamtbestand
(FA-AUF-06), die Ansicht braucht also ohnehin offene **und** erledigte Aufgaben in einer Antwort;
ein Statusfilter wäre toter Vertrag. Stattdessen ist die Antwort **beschnitten**: erledigte
Aufgaben werden nur zurückgegeben, wenn `completed_at` nicht älter als 30 Tage ist (Konstante im
Query-Service). Offene Aufgaben immer. Das verhindert genau das im Altsystem dokumentierte
Verhalten, dass „ohne Parameter alle je angelegten Aufgaben inklusive aller erledigten"
zurückkommen und die Antwort mit den Jahren unbegrenzt wächst.

**Standardsortierung** (eine Antwort, damit die Reihenfolge nicht dem Zufall überlassen bleibt):
Fälligkeit aufsteigend, Aufgaben ohne Datum ans Ende, bei Gleichstand Titel alphabetisch.
FA-AUF-17 schaltet clientseitig auf Priorität um.

`ConnectionResponse` bekommt zusätzlich ein Feld, das eine Verbindung ohne Tasks-Scope
kennzeichnet, damit das Frontend gezielt zum Neuverbinden auffordern kann.

Der PIN-Schutz folgt der bestehenden Linie: **konfigurierend = geschützt** (Listenauswahl),
**alltäglich = offen** (Aufgaben lesen, anlegen, abhaken) — genauso wie beim Kalender.

**Phase B endet grün:** `./gradlew check`, Sync funktioniert gegen WireMock, Endpunkte
erreichbar. Noch keine UI.

---

## Phase C — Frontend: Aufgabenansicht

Neues Feature-Verzeichnis `frontend/src/features/tasks/`:

| Datei | Inhalt |
|---|---|
| `TasksView.tsx` | Kopf „Aufgaben" mit „{erledigt} von {gesamt} erledigt", Sync-Knopf, Filterleiste, Kartenraster |
| `TaskFilterBar.tsx` | Pillen „Alle" / „Offen" / „Erledigt" mit Zählern; Voreinstellung **„Offen"** |
| `MemberTaskCard.tsx` | Karte je Mitglied mit Google-Konto; Kopfzeile in Mitgliedsfarbe, Avatar, Name, „{erledigt}/{gesamt} erledigt" |
| `ProgressRing.tsx` | SVG-Ring mit Prozentzahl (FA-AUF-02) |
| `TaskRow.tsx` | Rundes Abhak-Feld, Titel, Fälligkeit, Prioritätssterne, Notizenzeile, Bearbeiten-Knopf |
| `TaskDialog.tsx` | Titel, Priorität, Notizen **und Fälligkeitsdatum** |
| `dueDate.ts` | „Heute" / „Morgen" / „Überfällig" / `dd. MMM` |
| `taskSort.ts` | Sortierung nach Fälligkeit bzw. Priorität (FA-AUF-17) |
| `progress.ts` | erledigt/gesamt + Prozent |
| `useTasks.ts`, `useTaskSync.ts` | Generierte Hooks + optimistisches Abhaken |

Abweichungen vom Altsystem, jeweils aus den UI-Konventionen begründet:

- **Abhak-Feld ≥ 44 × 44 px** statt der 24 px des Altsystems (Touch-Ziel).
- **Bearbeiten-Knopf permanent sichtbar** statt hover-only — auf einem Touchdisplay gibt es
  kein Hover.
- **Filterzähler clientseitig** aus einer einzigen ungefilterten Abfrage statt zweier Requests.
  Erfüllt FA-AUF-06 (Zähler beziehen sich auf den Gesamtbestand) mit weniger Netzverkehr; bei
  Familiengrößen ist die Datenmenge trivial.
- **Fälligkeitsdatum im Dialog** (FA-AUF-12) — der Hauptmangel des Altsystems.
- **Notizen in der Liste sichtbar** (FA-AUF-20).

Mitgliedsfarben kommen aus dem bestehenden `@/features/members/colors` (`memberColorHex`) —
backendseitig ist dafür nichts zu tun. Gestylt wird ausschließlich über die Design-Tokens
(`bg-surface`, `text-primary`, `text-muted`, `accent`, `danger`) aus dem Settings-Overhaul,
damit Hell/Dunkel ohne Zusatzarbeit funktioniert.

**Navigation:** `AppShell.tsx` bekommt die Bereichsnavigation (Kalender / Aufgaben /
Einstellungen) mit Touch-Zielen ≥ 44 px; `App.tsx` die Route `/tasks`.

**Phase C endet grün:** `npm run check`, `/tasks` über die Navigation erreichbar.

---

## Phase D — Frontend: Einstellungen und Scope-Hinweis

- **`frontend/src/features/google/TaskListSection.tsx`** — analog `CalendarSection`:
  eingeklappte Sektion „Aufgabenlisten · {n} ausgewählt", je Verbindung die Listen mit
  Auswahl-Checkbox und Radio für die Zielliste, Speichern-Knopf. Eingehängt in `SettingsView`.
- **`useTaskLists.ts`** — Hooks für Listen, Auswahl, Sync.
- **Scope-Hinweis:** Verbindungen ohne Tasks-Scope zeigen in der Aufgabenansicht **und** in der
  Settings-Sektion einen Neuverbinden-Hinweis, der den bestehenden Reconnect-Weg auslöst.

**Phase D endet grün:** `scripts/pre-commit-check.sh` komplett grün.

---

## Fehlerbehandlung

Kein neuer Mechanismus — alles auf Bestehendem:

| Fall | Verhalten |
|---|---|
| Token widerrufen (`invalid_grant`) | `GoogleTokenProvider` setzt `status='revoked'` → `GoogleConnectionRevokedException` → HTTP 409 → bestehende Reconnect-Snackbar greift unverändert |
| Tasks-Scope fehlt | Sync überspringt die Verbindung mit WARN-Log; Frontend zeigt Neuverbinden-Hinweis |
| Pagination bricht ab | **Kein** Löschabgleich für diese Liste, ERROR-Log (TA-GOO-17) |
| Einzelne Liste scheitert | `try/catch` je Liste, nächste Liste läuft weiter |
| Liste bei Google gelöscht | `task_lists`-Zeile entfällt, `tasks` per FK-CASCADE mit |
| Schreiben scheitert bei Google | Exception propagiert, lokal wird nichts persistiert |
| Google offline | Anzeige läuft aus dem lokalen Spiegel weiter; Schreiben meldet einen Fehler |
| Keine Zielliste konfiguriert | `ValidationException` → HTTP 400 mit deutschem Text |

## Teststrategie

**Backend** (Testcontainers-PostgreSQL + WireMock, wie beim Kalender):

- `GoogleTasksClientTest` — Pagination über mehrere Seiten, `patch`-Semantik, 403 bei fehlendem
  Scope, abgebrochene Paginierung setzt `complete=false`.
- `TaskSyncServiceTest` (MockK) — neu / geändert / gelöscht, `priority` überlebt den Sync,
  **abgebrochene Pagination löscht nichts**, `is_selected=false` wird nicht synchronisiert,
  Verbindung ohne Tasks-Scope wird übersprungen.
- `TaskServiceTest` — Zielliste, Fehler bei Google → kein lokaler Schreibvorgang.
- `TaskControllerTest`, `TaskListControllerTest` — inkl. PIN-Schutz auf `selected`.
- `TaskSyncSchedulerTest` — Reentrancy-Guard.
- `MigrationSmokeTest` um V11 erweitert; ArchUnit-Test um das neue Package.

**Frontend — die 100-%-Branch-Schwelle ist die härteste Nebenbedingung** (`branches: 100`,
Rest 90; `src/api/generated/` ist ausgenommen). Deshalb hier festgeschrieben statt erst beim
Implementieren entschieden:

- **Verzweigungen wandern in reine Module** — `dueDate.ts`, `taskSort.ts`, `progress.ts` werden
  mit Tabellen-Tests erschöpfend abgedeckt. Komponenten bleiben dünn.
- **Jeder `isLoading` / `isError` / Leerzustand-Zweig bekommt einen Test.** Das sind die, die
  erfahrungsgemäß liegen bleiben.
- **Keine defensiven `??` / `?.` ohne erreichbaren Nullfall.** v8 zählt sie als Branch, und ein
  unerreichbarer Zweig ist nicht testbar. Wo generierte Typen optional sind, es fachlich aber
  nicht sein kann, wird an **einer** Stelle normalisiert statt an jeder Verwendung abgesichert.

**E2E** (`frontend/e2e/tasks.spec.ts`, analog `calendar.spec.ts`): Navigation zu „Aufgaben",
Aufgabe anlegen, abhaken, Filter umschalten.

**Gate:** `scripts/pre-commit-check.sh` — `./gradlew check` (OpenAPI-Codegen, ktlint, detekt,
Tests, JaCoCo) + `npm run check` (tsc, eslint `--max-warnings 0`, dependency-cruiser, Coverage).

## Definition of Done

Der Sprint ist fertig, wenn:

1. Ein Google-Konto mit Tasks-Scope verbunden werden kann und bestehende Konten einen
   verständlichen Neuverbinden-Hinweis bekommen.
2. Aufgabenlisten in den Einstellungen auswählbar sind.
3. `/tasks` über die Bereichsnavigation erreichbar ist und Aufgaben je Mitglied als Karten mit
   Fortschrittsring zeigt.
4. Aufgaben angelegt, bearbeitet, abgehakt und gelöscht werden können — jeweils bei Google
   sichtbar.
5. Der geplante Sync läuft und Änderungen aus Google innerhalb eines Intervalls erscheinen.
6. `scripts/pre-commit-check.sh` grün ist.
