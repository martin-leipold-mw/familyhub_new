# Design: Schritt 6 — Haushaltsaufgaben (Ämtli)

**Datum:** 2026-09-22
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Umfang:** Ein Spec, vier Phasen (A → B → C → D)
**Referenzen:** `docs/concept/03-haushalt-gamification.md` (Kapitel 1–5, 10–14),
`docs/concept/02-funktionale-anforderungen.md` (FA-HH-*, FA-ROT-*),
`docs/concept/05-datenmodell.md`, `docs/concept/10-neuauflage.md` (Baureihenfolge, Punkt 6)

## Ziel & Motivation

Nach Kalender (Schritt 4) und persönlichen Aufgaben (Schritt 5) bringt Schritt 6 den dritten
Alltagsnutzen: wiederkehrende Haushaltsaufgaben, die sich ohne Zutun auf die Familie verteilen.

Das Altsystem hatte dafür ein vollständiges Modul, das in `03-haushalt-gamification.md` mit
**46 bekannten Schwächen** dokumentiert ist. Diese Neuauflage baut es nicht nach, sondern ersetzt
das zugrundeliegende Modell — und lässt damit einen Großteil der Schwächen konstruktiv entfallen,
statt sie einzeln zu reparieren.

**Der Modellwechsel:** Das Altsystem war *kalenderförmig* — jede Instanz gehörte zu genau einem Tag
und trug eine Fälligkeitsuhrzeit. Daraus folgten die gravierendsten Mängel: ausgefallene
Scheduler-Läufe hinterließen dauerhafte Lücken (Schwäche 2), der Rhythmus verschob sich
unkontrolliert (3), übersprungene Turnusse verfielen ersatzlos (7), und die Vorschau rechnete nach
einem anderen Verfahren als die Generierung (6).

FamilyHub Schritt 6 modelliert Haushaltsaufgaben stattdessen als **Warteschlange je Person**:
Aufgaben haben **kein Datum**. Jede Person hat eine Liste von höchstens fünf offenen Ämtli. Eine
Vorlage wird nach Ablauf ihres Intervalls wieder fällig, wandert an die nächste Person der Rotation
und bleibt dort liegen, bis sie abgehakt ist. Erst die Erledigung startet das Intervall neu.

Das ist nicht nur einfacher, es ist für den Zweck richtiger: „Die Toilette wird wöchentlich
geputzt" heißt fachlich „sieben Tage nachdem sie zuletzt geputzt wurde" — nicht „jeden Dienstag,
egal ob letzte Woche geputzt wurde".

## Umfang

**Enthalten:** FA-HH-01 bis -05, -08, -10, -12, -14 (neu gelöst), -20, -21, -22, -23, -24, -30,
-31, -32, -34 (konstruktiv gelöst); FA-ROT-01, -02, -03, -05, -07, -12.

FA-ROT-08 („Tageslimit je Mitglied") ist **abgewandelt** enthalten: an die Stelle eines Limits pro
Tag tritt eine Obergrenze **offener** Aufgaben je Person. Im datumslosen Modell ist ein Tageslimit
gegenstandslos; die Obergrenze erfüllt denselben Zweck (Deckelung der Belastung) besser, weil
erledigte Aufgaben nicht mitzählen.

**Bewusst nicht enthalten (YAGNI bzw. eigene Themen):**

| Weggelassen | Begründung |
|---|---|
| Punkte-Konten, Streaks, Abzeichen, Rangliste (FA-GAM, FA-BADGE, FA-LEAD, FA-STAT) | Schritt 7 der Baureihenfolge. Das Feld `points` wird jedoch bereits geführt und eingefroren — siehe Grundsatzentscheidungen. |
| Überspringen (FA-HH-37, KANN) | Im Altsystem ein Endpunkt ohne Bedienfläche und ohne Rücknahme. Additiv nachziehbar. |
| Umzuweisen (FA-HH-38, KANN) | Ebenfalls ohne Bedienfläche im Altsystem. Die daraus folgende Lücke ist unten ausdrücklich festgehalten. |
| Elternfreigabe / Verifikationsschritt (FA-HH-33, SOLL; Empfehlung E2) | Wird erst mit den Punkten in Schritt 7 fachlich bedeutsam. Entscheidung des Auftraggebers: offenes Abhaken. |
| Abwesenheiten (FA-ROT-06, SOLL; Empfehlung R4) | Eigenes Thema (Zeiträume je Mitglied). Deaktivieren wirkt als grober Ersatz. |
| Last-Ausgleich und Zufallsverteilung (FA-ROT-09/-10, beide KANN) | Entscheidung des Auftraggebers: nur „Reihum". Last-Ausgleich später. |
| Fester Wochentag / Monatstag (FA-HH-09, SOLL; Empfehlung R5) | Ohne angezeigtes Datum für die Familie nicht wahrnehmbar. |
| Vorschau der nächsten Zuweisungen (FA-HH-13, SOLL) | Im Warteschlangen-Modell gegenstandslos — es gibt keine Termine, die man vorausberechnen könnte. |
| Notiz zur Erledigung (FA-HH-39, KANN) | Im Altsystem nicht erfassbar und beim Zurücknehmen nicht geleert. |

**Ausdrücklich festgehaltene Lücke:** Fährt jemand mit einer offenen Aufgabe in den Urlaub, ohne
deaktiviert zu werden, bleibt diese Vorlage liegen, bis er zurück ist. Die Antwort darauf wäre
„Umzuweisen" — ein Endpunkt und eine Bedienfläche, die hier bewusst fehlen.

## Getroffene Grundsatzentscheidungen

| Frage | Entscheidung | Verworfene Alternative |
|---|---|---|
| Grundmodell | **Warteschlange ohne Datum**, höchstens fünf offene Aufgaben je Person. | Kalenderförmige Tagesinstanzen wie im Altsystem — erzeugt Lücken, Rhythmusdrift und verfallende Turnusse. Auch die zwischenzeitlich erwogene 14-Tage-Vorausgenerierung entfällt: ohne Datum gibt es nichts vorauszuberechnen. |
| Fälligkeit | **Intervall ab letzter Erledigung.** `next_due_on = Erledigungstag + interval_days`. | Intervall ab letzter Ausgabe — dieselbe Aufgabe könnte mehrfach offen sein („Bad putzen" zweimal), die Obergrenze wäre der einzige Stauschutz. Fester Wochentag — ohne sichtbares Datum wertlos. |
| Rotation | **Nur „Reihum"**, Pool aus der Zuweisungsgruppe (Eltern / Kinder / Alle), Reihenfolge nach Anlagedatum. Keine feste Person — jeder muss mal die Toilette machen. | Feste Zuweisung je Vorlage (unfair). Zufallsverteilung (bei Vorausgabe nicht erklärbar, ignorierte im Altsystem das Limit). Last-Ausgleich (später). |
| Abhaken | **Offen, ohne PIN**, verbucht auf das **zugewiesene** Mitglied; kein wählbarer Parameter. 5-Minuten-Rücknahme. | Elternfreigabe je Vorlage (Schritt 7). PIN beim Abhaken — widerspricht der Projektlinie „alltäglich = offen" und dem Kiosk-Betrieb. |
| Nachrücken | **Einmal täglich morgens** wird auf bis zu fünf offene Aufgaben aufgefüllt. Leere Liste zeigt „Alles erledigt!". | Sofortiges Nachrücken beim Abhaken — die Liste wird nie leer, das Erfolgserlebnis entfällt und Fertigwerden fühlt sich an wie Strafe. Nur-wenn-leer — eine liegengebliebene Aufgabe blockiert dauerhaft alle weiteren. |
| Symbol | **Emoji direkt an der Vorlage**, aus einer Palette gewählt. `category` entfällt. | Kategorie mit hinterlegtem Emoji (Altsystem: zwei widersprüchliche Frontend-Listen, Schwäche 36). Kategorie plus Überschreibung — zwei Felder für dieselbe Aussage. |
| Namensgebung | Tabellen `chores` / `chore_assignments`, Paket `com.familyhub.chores`, Route `/chores`. | `household_task*` wie in den Altsystem-Docs — `tasks` bezeichnet im Neubau bereits die Google-Aufgaben, die Verwechslungsgefahr wäre dauerhaft. |

**Das Emoji ist kein Beiwerk, sondern das Leseinterface.** Die jüngste Nutzerin ist fünf Jahre alt
und kann noch nicht richtig lesen. Jede Gestaltungsentscheidung der Familienansicht ordnet sich dem
unter.

---

## Phase A — Datenmodell

### Migration `V12__chores.sql`

UUID-Schema wie der übrige Neubau.

**`chores`** — die Vorlage:

| Spalte | Typ | Null | Bemerkung |
|---|---|---|---|
| `id` | `UUID` | nein | PK |
| `name` | `VARCHAR(255)` | nein | „Toilette putzen" |
| `icon` | `VARCHAR(16)` | nein | Emoji — Pflichtfeld |
| `description` | `TEXT` | ja | optionale Detailzeile („Auch den Spiegel!") |
| `interval_days` | `INT` | nein | CHECK `> 0` |
| `assignment_group` | `VARCHAR(10)` | nein | CHECK `IN ('parents','children','all')` |
| `points` | `INT` | nein | Default `10` |
| `is_active` | `BOOLEAN` | nein | Default `TRUE` |
| `next_due_on` | `DATE` | nein | **Der gesamte Terminzustand.** Bei Anlage = heute |
| `last_assigned_member_id` | `UUID` | ja | FK → `family_members(id)` ON DELETE SET NULL — der Rotationszeiger |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | nein | |

**`chore_assignments`** — die Zuweisung:

| Spalte | Typ | Null | Bemerkung |
|---|---|---|---|
| `id` | `UUID` | nein | PK |
| `chore_id` | `UUID` | nein | FK → `chores(id)` ON DELETE CASCADE |
| `member_id` | `UUID` | nein | FK → `family_members(id)` ON DELETE CASCADE |
| `status` | `VARCHAR(10)` | nein | CHECK `IN ('open','completed')`, Default `'open'` |
| `points` | `INT` | nein | eingefrorene Kopie aus der Vorlage |
| `assigned_on` | `DATE` | nein | Ausgabetag, für Diagnose und Alter |
| `completed_at` | `TIMESTAMPTZ` | ja | |
| `created_at`, `updated_at` | `TIMESTAMPTZ` | nein | |

**Der zentrale Constraint:**

```sql
CREATE UNIQUE INDEX ux_chore_assignments_one_open
    ON chore_assignments (chore_id) WHERE status = 'open';
```

Eine Vorlage kann nie zweimal gleichzeitig offen sein — datenbankseitig garantiert. Das Altsystem
hatte dafür nur eine anwendungsseitige Prüfung und keinen Constraint; bei parallelen Läufen waren
Dubletten möglich (Schwäche 4, FA-HH-23). Dazu ein Index auf `(member_id, status)` für die
Swimlane-Abfrage.

### Felder, die das Altsystem hat und die hier bewusst fehlen

- **`rotation_mode`** — hätte nur den Wert `round_robin`. Später additiv.
- **`category`** — diente allein der Emoji-Ableitung; das Emoji steht jetzt an der Vorlage.
- **`frequency_config`** — im Altsystem seit V19 von keiner Logik mehr gelesen, ein totes Feld.
- **`priority`, `estimated_duration_minutes`** — im Altsystem nirgends ausgewertet und über die
  Oberfläche nicht pflegbar.
- **`default_due_hour`, `due_date`** — es gibt keine Termine mehr.
- **Statuswert `in_progress`** — im Altsystem im Constraint erlaubt, aber nie gesetzt oder gelesen.
- **`completed_by_member_id`** — verbucht wird immer auf `member_id`; siehe Phase B.

### Warum `points` trotz Schritt 7 schon jetzt geführt wird

Bewusste Ausnahme von YAGNI. Die eingefrorene Kopie muss **zum Zeitpunkt der Erledigung**
existieren, sonst hat die Gamification in Schritt 7 keine korrekte Historie und müsste sie
erfinden. Zwei Spalten jetzt sind billig; eine rückwirkend erfundene Punktehistorie ist nicht
reparierbar. Der Vorlagen-Dialog pflegt die Punkte (Schieberegler 5–50 in 5er-Schritten), die
Familienansicht zeigt sie in Schritt 6 **nicht** an.

### Löschen einer Vorlage

Das Löschen wird abgelehnt (HTTP 400, deutscher Text mit Hinweis auf „Pausieren"), sobald erledigte
Zuweisungen existieren. Im Altsystem löschte `CASCADE` die komplette Instanzhistorie mit, während
die gutgeschriebenen Punkte stehen blieben — Zeitraum-Ranglisten verloren ihre Datenbasis
(Schwäche 31, FA-HH-14). Die Einstellungen bieten „Pausieren" als Hauptaktion an; eine pausierte
Vorlage ist in der Familienansicht unsichtbar.

**Phase A endet grün:** `./gradlew check` läuft durch, Migration greift, der partielle Unique-Index
ist gegen die echte Datenbank getestet. Noch keine UI-Wirkung.

---

## Phase B — Logik und Vertrag

### Paket `com.familyhub.chores`

`Chore`, `ChoreAssignment`, `ChoreRepository`, `ChoreAssignmentRepository`, `ChoreService`
(Vorlagen-CRUD), `ChoreAssignmentService` (Abhaken / Rückgängig), `ChoreRefillService` (Ausgabe),
`ChoreRefillScheduler`, `ChoreController`, `ChoreAssignmentController`.

Die ArchUnit-Regeln greifen über die Namenskonventionen (`*Controller`, `*Service`, `*Repository`)
und erfassen das neue Paket automatisch. Es hängt nur an `members`, `settings` und
`shared.exceptions`.

### Rotation

```text
waehleNaechsten(vorlage) -> Mitglied ODER NICHTS

  P := aktive Mitglieder der Gruppe, ORDER BY created_at    // deterministisch
       parents  -> role = 'parent'
       children -> role = 'child'
       all      -> alle aktiven
  WENN P leer -> gib NICHTS zurueck                         // Vorlage wartet

  start := Position(vorlage.lastAssignedMemberId) in P + 1 MOD n
           bzw. 0, wenn unbekannt oder nicht mehr im Pool

  FUER offset VON 0 BIS n-1
      k := P[(start + offset) MOD n]
      WENN offeneZuweisungen(k) < MAX_OFFEN -> gib k zurueck
  ENDE FUER

  gib NICHTS zurueck                                        // alle voll
```

`FamilyMemberRepository.findByIsActiveTrueOrderByCreatedAtAsc` existiert bereits — damit ist
FA-ROT-07 („deterministische, stabile Pool-Reihenfolge") ohne Zusatzarbeit erfüllt. Im Altsystem
enthielten die Abfragen kein `ORDER BY`, die Reihum-Reihenfolge war formal undefiniert
(Schwäche 1).

**Warum das Überspringen einer vollen Person fair ist:** Wer am Limit steht, hat bereits fünf
offene Ämtli. Ihn zu überspringen ist kein entgangener Turnus, sondern genau der Lastausgleich. Der
Zeiger rückt nur bei tatsächlicher Ausgabe weiter, die übersprungene Person steht also beim
nächsten Lauf wieder weit vorne.

### Ausgabelauf

```text
fuelleAuf(heute)                              // heute in family.timezone

  0. loesche offene Zuweisungen inaktiver Mitglieder        // gibt die Vorlage frei

  1. FUER JEDE Vorlage mit
         is_active = true
         UND next_due_on <= heute
         UND ohne offene Zuweisung
     sortiert nach next_due_on aufsteigend, dann created_at
     — eigene Transaktion je Vorlage —

         m := waehleNaechsten(Vorlage)
         WENN m ist NICHTS -> INFO-Log "wartet", NAECHSTE Vorlage

         lege an: chore_assignments(
             chore_id    = Vorlage.id,
             member_id   = m.id,
             status      = 'open',
             points      = Vorlage.points,      // Kopie, ab jetzt unabhaengig
             assigned_on = heute)

         Vorlage.lastAssignedMemberId := m.id
  ENDE FUER
```

Drei Eigenschaften, die aus diesem Zuschnitt **folgen**, statt eigens gebaut zu werden:

1. **Nachholung braucht keinen Mechanismus** (FA-HH-22, Empfehlung G1). Die Bedingung lautet
   `next_due_on <= heute`, nicht „heute ist der Stichtag". Steht der NAS drei Tage still, wird beim
   Start alles Fällige ausgegeben. Kein Laufprotokoll, kein „letzter erfolgreicher Lauf"-Zeitstempel.
2. **Deaktivierte Mitglieder heilen sich selbst.** Schritt 0 gibt blockierte Vorlagen frei — ohne
   einen Aufruf aus `members` heraus, der die Modulgrenzen verletzen würde. Mitglieder werden im
   Projekt weich gelöscht (`isActive = false`), der Fremdschlüssel greift also nicht.
3. **Eine Transaktion je Vorlage** (Empfehlung G4). Im Altsystem rollte ein Fehler in einer einzigen
   Vorlage den kompletten Lauf zurück.

Alle Tagesberechnungen laufen über `SettingsService.timezone()` (`family.timezone`, Default
`Europe/Berlin`). Das Altsystem rechnete Fälligkeiten in UTC, Serien in der Systemzeitzone und die
Anzeige wieder in UTC — mit dem Ergebnis, dass die Ansicht abends bereits den Folgetag zeigte
(Schwächen 43, 46; Empfehlung G6).

### Scheduler

`ChoreRefillScheduler`:

- `@Scheduled(cron = "${familyhub.chores.refill-cron:0 0 5 * * *}")` — täglich 05:00 Uhr.
- Einmalig 5 Sekunden nach Anwendungsstart (`initialDelay`).
- `AtomicBoolean`-Reentrancy-Guard wie `CalendarSyncScheduler` und `TaskSyncScheduler`.
- INFO-Log mit Anzahl ausgegebener und wartender Vorlagen.

**Neu angelegte oder wieder aktivierte Vorlagen lösen den Lauf für genau diese Vorlage sofort aus.**
Sonst müsste man bis zum nächsten Morgen warten, um zu sehen, ob die Aufgabe funktioniert. Damit
entfällt der im Altsystem ungeschützte manuelle Generierungs-Endpunkt ersatzlos (FA-HH-26).

**Obergrenze:** `familyhub.chores.max-open-per-member`, Code-Default **5**. Gezählt werden
**offene** Zuweisungen. Das Altsystem zählte alle Instanzen eines Tages unabhängig vom Status —
erledigte und übersprungene blockierten also weitere Zuweisungen (Abschnitt 3.5 der Konzeptdocs).
Eine Obergrenze je Mitglied ist die naheliegende spätere Erweiterung.

### Abhaken und Rückgängig

```text
erledige(zuweisungId)                          // KEIN Mitglieds-Parameter
  Z := lade Zuweisung                          // 404
  WENN Z.status = 'completed' -> gib Z unveraendert zurueck    // idempotent
  Z.status      := 'completed'
  Z.completedAt := jetzt
  Z.chore.next_due_on := heute + Z.chore.interval_days

nimmZurueck(zuweisungId)
  Z := lade Zuweisung                          // 404
  WENN Z.status <> 'completed' -> gib Z unveraendert zurueck   // idempotent
  WENN Z.completedAt < jetzt - 300 Sekunden ->
      400 "Rueckgaengig ist nur innerhalb von 5 Minuten moeglich."
  Z.status      := 'open'
  Z.completedAt := NULL
```

**Kein `completedByMemberId`.** Verbucht wird immer auf `assignment.member_id`. Damit sind zwei
Altsystem-Schwächen konstruktiv ausgeschlossen statt nachgebaut: das freie Gutschreiben fremder
Punkte (Schwäche 11, FA-HH-34) und der Signatur-Defekt, bei dem das Frontend den Parameter im Body
sendete, während der Server ihn als Query-Parameter erwartete (Schwäche 13). Letzterer kann hier
ohnehin nicht entstehen, weil der Vertrag aus `openapi.yml` generiert wird (Empfehlung U7).

**`next_due_on` bleibt beim Zurücknehmen unberührt.** Solange die Zuweisung offen ist, verhindert
der partielle Unique-Index eine erneute Ausgabe, und die nächste Erledigung überschreibt den Wert
ohnehin.

### `api/openapi.yml`

Alle Änderungen sind **additiv** — kein oasdiff-Breaking-Change, kein `breaking-change`-Label.

| Methode | Pfad | Zweck | Schutz |
|---|---|---|---|
| GET | `/v1/chores` | Vorlagen, optional `activeOnly` | — |
| POST | `/v1/chores` | anlegen | `@RequiresPinSession` |
| PATCH | `/v1/chores/{id}` | ändern, inkl. `isActive` | `@RequiresPinSession` |
| DELETE | `/v1/chores/{id}` | löschen (400 bei Historie) | `@RequiresPinSession` |
| GET | `/v1/chore-assignments` | offene **und** heute erledigte | — |
| POST | `/v1/chore-assignments/{id}/complete` | abhaken | — |
| POST | `/v1/chore-assignments/{id}/undo` | zurücknehmen | — |

Der PIN-Schutz folgt der bestehenden Linie: **konfigurierend = geschützt, alltäglich = offen** —
wie bei Kalender und Aufgaben. Im Altsystem war der gesamte Haushaltsbereich ungeschützt; selbst der
manuelle Generierungslauf war frei aufrufbar (Schwäche 10).

Die Antwort von `GET /v1/chore-assignments` ist **beschnitten** auf offene Einträge plus die des
heutigen Tages (Haushaltszeitzone). Genug für die Ansicht, und sie wächst nicht mit den Jahren.
Eine Zuweisung trägt in der Antwort Name, Emoji und Beschreibung der Vorlage über die
Fremdschlüsselbeziehung auf — eine Umbenennung wirkt damit sofort.

### Fehlerfälle

| Fall | Verhalten |
|---|---|
| Pool leer (z. B. `children`, aber kein aktives Kind) | keine Ausgabe, INFO-Log, Vorlage bleibt fällig und kommt beim nächsten Lauf erneut dran |
| Alle Poolmitglieder am Limit | dito — nichts verfällt (behebt Schwäche 7) |
| Mitglied wird deaktiviert | offene Zuweisung wird beim nächsten Lauf freigegeben, Vorlage geht an jemand anderen |
| Zwei Läufe gleichzeitig | der partielle Unique-Index verhindert die zweite offene Zuweisung |
| Rückgängig nach Ablauf der Frist | HTTP 400 mit deutschem Text |
| Vorlage mit erledigter Historie löschen | HTTP 400 mit Hinweis auf „Pausieren" |
| Einzelne Vorlage scheitert im Lauf | eigene Transaktion, die übrigen laufen weiter |

**Phase B endet grün:** `./gradlew check`, Endpunkte erreichbar, Ausgabelauf getestet. Noch keine
UI.

---

## Phase C — Familienansicht

`AppShell` bekommt einen vierten Bereich: **Kalender · Aufgaben · Haushalt · Einstellungen**,
Touch-Ziele ≥ 44 px. `App.tsx` bekommt die Route `/chores`.

Neues Verzeichnis `frontend/src/features/chores/`:

| Datei | Inhalt |
|---|---|
| `ChoresView.tsx` | Kopfzeile „Haushalt", darunter das Swimlane-Raster; Lade-, Fehler- und Leerzustände |
| `ChoreLane.tsx` | Eine Spalte je **aktivem** Mitglied — auch ohne Aufgaben. Kopf in Mitgliedsfarbe mit Avatar und Name, darunter „3 offen" bzw. „Alles erledigt! 🎉" |
| `ChoreCard.tsx` | Großes Emoji (≈ 56 px), Name in großer Schrift, Beschreibung klein darunter, rechts ein rundes Abhak-Feld von 64 px |
| `choreLanes.ts` | reine Funktion: Mitglieder + Zuweisungen → sortierte Lanes |
| `undoWindow.ts` | reine Funktion: `completedAt` + `jetzt` → darf zurückgenommen werden |
| `choreIcons.ts` | die Emoji-Palette (≈ 30 haushaltstypische Symbole) |
| `useChores.ts`, `useChoreAssignments.ts` | generierte Hooks, optimistisches Abhaken |

Vier Festlegungen für das Wanddisplay und die jüngste Nutzerin:

- **Abhaken über einen eigenen großen Knopf, nicht über die ganze Karte.** Beim Wischen durch eine
  Liste wäre eine flächig tippbare Karte zu leicht versehentlich ausgelöst; die 5-Minuten-Rücknahme
  fängt den Rest.
- **Erledigtes bleibt bis zum nächsten Morgen sichtbar** — durchgestrichen und ausgegraut, ans Ende
  der Lane sortiert, mit „Rückgängig", solange die Frist läuft. Ein Kind sieht damit, was es
  geschafft hat, statt dass die Aufgabe spurlos verschwindet.
- **Das Emoji trägt die Information.** Name und Beschreibung stehen daneben, sind aber nicht nötig,
  um die Aufgabe zu erkennen.
- **Fehlgeschlagenes Abhaken meldet sich.** Optimistische Anzeige, bei Fehler Rücknahme plus
  Snackbar über den vorhandenen `SnackbarProvider`. Im Altsystem verschwand bei einem Fehler nur der
  Spinner, ohne jede Meldung (Schwäche 41).

Das Raster ist `auto-fit` mit Mindestbreite je Spalte; bei vielen Mitgliedern scrollt es waagerecht,
statt die Spalten unlesbar schmal zu quetschen. Mitgliedsfarben kommen aus dem bestehenden
`@/features/members/colors`. Gestylt wird ausschließlich über die Design-Tokens aus dem
Settings-Umbau (`bg-surface`, `text-primary`, `text-muted`, `accent`, `danger`), damit Hell/Dunkel
ohne Zusatzarbeit funktioniert.

**Phase C endet grün:** `npm run check`, `/chores` über die Bereichsnavigation erreichbar.

---

## Phase D — Einstellungen

`frontend/src/features/chores/ChoreSection.tsx` als weiterer `SectionCard` in `SettingsView` —
Überschrift „Haushalt", Knopf „Neue Aufgabe". Je Vorlage eine Zeile mit Emoji, Name und der Zeile
„Wöchentlich · Kinder · 10 Pkt."; pausierte Vorlagen sind markiert. Aktionen je Zeile: Pausieren
bzw. Aktivieren und Bearbeiten.

`ChoreDialog.tsx`: Name, **Emoji-Auswahl aus der Palette**, Beschreibung, Intervall-Kacheln,
Gruppen-Kacheln (Eltern / Kinder / Alle), Punkte-Schieberegler, im Bearbeiten-Modus zusätzlich
„Aktiv" und „Löschen".

Intervall-Kacheln — abweichend vom Altsystem, das `daily` in Migration V19 ausdrücklich entfernte
(„Tasks can only be assigned minimum weekly"):

| Label | `interval_days` |
|---|---|
| Täglich | 1 |
| Alle 2 Tage | 2 |
| Wöchentlich | 7 |
| Alle 2 Wochen | 14 |
| Monatlich | 30 |
| Vierteljährlich | 90 |

**Warum „täglich" zurückkommt:** Im Warteschlangen-Modell kann sich nichts stauen — eine tägliche
Aufgabe erscheint frühestens am Tag nach ihrer Erledigung wieder, und die Obergrenze von fünf
deckelt die Liste ohnehin. Genau die häufigsten Familienaufgaben („Tisch decken", „Spülmaschine
ausräumen") sind täglich; ohne sie wäre das Modul für den Alltag mit kleinen Kindern kaum nutzbar.

Bestätigungen laufen über die vorhandenen Dialog-Bausteine wie in `MemberSection` — keine
`alert`/`confirm`-Browserdialoge (Empfehlung U4); auf einem Wanddisplay ohne Tastatur sind die
unpassend.

**Phase D endet grün:** `scripts/pre-commit-check.sh` komplett grün.

---

## Teststrategie

**Backend** (Testcontainers-PostgreSQL):

- `ChoreRotationTest` — Pool nach Gruppe, deterministische Reihenfolge, Zeiger nach Ausgabe, volle
  Person wird übersprungen, leerer Pool, zuletzt zugewiesenes Mitglied nicht mehr im Pool.
- `ChoreRefillServiceTest` — fällig / nicht fällig, offene Zuweisung blockiert eine zweite,
  Reihenfolge bei knapper Kapazität, Freigabe der Zuweisungen inaktiver Mitglieder, **Nachholung
  nach mehrtägigem Ausfall**, eigene Transaktion je Vorlage.
- `ChoreAssignmentServiceTest` — Erledigen setzt `next_due_on`, Idempotenz, Rücknahme innerhalb und
  außerhalb der Frist.
- `ChoreServiceTest` — Löschschutz bei Historie, sofortige Ausgabe bei Anlage und Reaktivierung.
- `ChoreControllerTest`, `ChoreAssignmentControllerTest` — inkl. PIN-Schutz der schreibenden
  Vorlagen-Endpunkte.
- `ChoreRefillSchedulerTest` — Reentrancy-Guard.
- Ein Repository-Test, der den **partiellen Unique-Index gegen die echte Datenbank** prüft: zwei
  offene Zuweisungen derselben Vorlage müssen scheitern.
- `MigrationSmokeTest` um V12 erweitert. Der ArchUnit-Test braucht **keine** Erweiterung, muss aber
  unverändert grün bleiben; schlägt er an, liegt eine Schichtverletzung im neuen Code vor.

**Frontend — die 100-%-Branch-Schwelle ist die härteste Nebenbedingung** (`branches: 100`, Rest 90;
`src/api/generated/` ist ausgenommen):

- **Verzweigungen wandern in reine Module** — `choreLanes.ts` und `undoWindow.ts` werden mit
  Tabellen-Tests erschöpfend abgedeckt, die Komponenten bleiben dünn.
- **Jeder `isLoading` / `isError` / Leerzustand-Zweig bekommt einen Test.**
- **Keine defensiven `??` / `?.` ohne erreichbaren Nullfall** — wo generierte Typen optional sind,
  es fachlich aber nicht sein kann, wird an **einer** Stelle normalisiert.

**E2E** (`frontend/e2e/chores.spec.ts`, analog `tasks.spec.ts`): Vorlage in den Einstellungen
anlegen (mit PIN), sie erscheint sofort in der Lane des zugewiesenen Mitglieds, abhaken, rückgängig
machen.

**Gate:** `scripts/pre-commit-check.sh` — `./gradlew check` (OpenAPI-Codegen, ktlint, detekt, Tests,
JaCoCo) + `npm run check` (tsc, eslint `--max-warnings 0`, dependency-cruiser, Coverage).

## Definition of Done

Der Sprint ist fertig, wenn:

1. Eine Ämtli-Vorlage in den Einstellungen anlegbar ist und **sofort** in der Lane des zugewiesenen
   Mitglieds erscheint.
2. `/chores` über die Bereichsnavigation erreichbar ist und je aktivem Mitglied eine Spalte mit
   höchstens fünf offenen Aufgaben zeigt — mit großem Emoji, groß genug für ein Kind, das noch nicht
   liest.
3. Abhaken und Rückgängigmachen per Fingertipp funktionieren, inklusive sichtbarer Fehlermeldung.
4. Nach einer Erledigung die Aufgabe erst nach Ablauf ihres Intervalls wieder auftaucht — bei der
   **nächsten** Person der Rotation.
5. Ein mehrtägiger Ausfall des NAS keine Aufgabe verschluckt.
6. Eine leere Liste „Alles erledigt!" zeigt.
7. `scripts/pre-commit-check.sh` grün ist.
