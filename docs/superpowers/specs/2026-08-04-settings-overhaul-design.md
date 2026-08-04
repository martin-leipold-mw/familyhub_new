# Design: Überarbeitung der Einstellungsseite

**Datum:** 2026-08-04
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Umfang:** Ein Spec, vier Phasen (A → C → B → D)

## Ziel & Motivation

Die aktuelle Einstellungsseite (`frontend/src/features/settings/SettingsView.tsx`) ist
unübersichtlich: zu viele große Buttons, PIN-Eingabe erst nach Klick, Google-Konten und
Kalender in getrennten, überladenen Blöcken. Zusätzlich hängt die PIN-Prüfung in einem
toten Zustand, wenn die Backend-Session abläuft, während das Frontend sich noch
„entsperrt" glaubt.

Diese Überarbeitung bringt:
1. Ein wiederverwendbares **Theme-System** (hell/dunkel) als Fundament.
2. Ein **aufgeräumtes Layout** im daely-inspirierten Look (genehmigtes Mockup v2).
3. Ein **ganzseitiges PIN-Gate** mit Tastaturbedienung und einem Root-Cause-Fix des
   Session-Bugs.
4. Eine explizite **Mitglied ↔ Google-Konto-Verknüpfung** („erst Mitglied wählen").

### Referenz-Mockup
Genehmigtes visuelles Ziel: `.superpowers/brainstorm/*/content/settings-redesign-v2.html`
(Hell + Dunkel, Akzentfarbe Grün, Trash-Icon rechts, `+` im Kartenkopf, Kalender als
eigene eingeklappte Card).

## Nicht-Ziele (YAGNI)
- Kein Redesign von Kalender-/Setup-Seiten in diesem Spec (folgen später auf dem Theme-Fundament).
- Keine Mehrfach-Google-Konten pro Mitglied (bewusst 1:1).
- Keine DB-Migration (der OAuth-State ist in-memory).

---

## Phase A — Theme-System (Fundament, Frontend-only)

**Ziel:** Weg von hartcodiertem `bg-slate-900`; hell/dunkel per Tokens.

- **Tailwind:** `darkMode: 'class'` in `frontend/tailwind.config.ts`. Design-Tokens als
  CSS-Variablen in `frontend/src/index.css`, gemappt in `theme.extend.colors`:
  - `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, `--accent`,
    `--accent-weak`, `--danger`, `--danger-weak`, `--warn`, `--warn-weak`
  - Tailwind-Aliase: `bg`, `surface`, `border-subtle`, `text-primary`, `text-muted`,
    `accent`, `danger`, `warn` (nutzbar als `bg-surface`, `text-muted`, `bg-accent` …).
- **Palette** (aus Mockup v2):
  - Hell: `--bg:#F4F2EE`, `--surface:#FFFFFF`, `--border:#E7E3DC`, `--text:#1C1B19`,
    `--muted:#807A70`, `--accent:#2E6F5E`, `--accent-weak:#E4EFE9`, `--danger:#C7503F`,
    `--danger-weak:#F6E4E0`, `--warn:#B5771F`, `--warn-weak:#F6ECD9`
  - Dunkel: `--bg:#15181B`, `--surface:#1E2328`, `--border:#2E353C`, `--text:#F1EFEB`,
    `--muted:#9AA0A6`, `--accent:#54C9A3`, `--accent-weak:#1C3A32`, `--danger:#E9705E`,
    `--danger-weak:#3A2420`, `--warn:#E0A94A`, `--warn-weak:#352B18`
  - **Akzent = Grün**, als **ein** Token — später mit einer Zeile austauschbar.
- **`ThemeProvider`** (neu, `frontend/src/features/theme/`):
  - Initialmodus = `localStorage['familyhub.theme']` sonst `prefers-color-scheme`.
  - Setzt/entfernt `class="dark"` am `<html>`-Element.
  - Kontext-Hook `useTheme()` mit `theme` + `toggle()`.
  - Provider wird in `main.tsx` (oder `App`) oberhalb der Routes gemountet.
- **Toggle-Komponente** (Sonne/Mond) — vorerst in der Settings-Topbar.

**Bewusster Zwischenstand:** Kalender-/Setup-Seiten bleiben vorerst hartcodiert dunkel.
Der globale Toggle wirkt sichtbar nur auf migrierte Bereiche (zunächst Settings). Das ist
akzeptiert („Settings zuerst").

**Tests:** `ThemeProvider` (Default aus System/localStorage, `toggle` schaltet `dark`-Klasse,
Persistenz). `npm run check` grün.

---

## Phase C — PIN-Gate + Tastatur + Session-Bugfix (Frontend-only)

**Ziel:** PIN-Abfrage sofort beim Betreten; Tastaturbedienung; kein toter „PIN-Sitzung
erforderlich"-Zustand mehr.

### Ganzseitiges Gate
- `SettingsView` rendert bei `!hasPinSession` **nur** ein zentriertes PIN-Tastenfeld
  (mit „← Zum Kalender"). Erst nach erfolgreicher Verifikation der Seiteninhalt.
- Der bisherige „Zum Bearbeiten entsperren"-Button und das read-only-Ansehen entfallen.
- Neue Komponente `PinGate` (`features/pin/PinGate.tsx`) kapselt: kein Session →
  Keypad-Vollbild; Session → `children`.

### Tastaturbedienung
- `PinInputDialog` (`features/pin/PinInputDialog.tsx`) bekommt einen `keydown`-Handler:
  - `0`–`9` → Ziffer anfügen (Cap bei 6 bleibt)
  - `Backspace` → letzte Ziffer löschen
  - `Enter` → bestätigen (nur wenn `valid`)
  - `Escape` → `onCancel`
- Touch-Keypad bleibt vollständig erhalten (Wanddisplay).

### Root-Cause-Fix des Session-Bugs
Ursache: Frontend-`hasPinSession` (15-Min-Timer, `sessionStorage`) und die serverseitige
PIN-Session (`PinSessionInterceptor` → `401 UNAUTHORIZED`, „PIN-Sitzung erforderlich")
laufen auf getrennten Uhren. Läuft die Backend-Session zuerst ab, zeigt das Frontend
weiter Bearbeiten-UI, aber jede Mutation bekommt 401 ohne sichtbaren Ausweg.

Fix (defense-in-depth, an der Wurzel):
- `customFetch` (`frontend/src/api/customFetch.ts`) erkennt `response.status === 401` und
  löst einen zentralen „session-expired"-Mechanismus aus (z. B. Event über
  `sessionTokenStore` oder ein kleiner Emitter).
- `PinSessionContext` abonniert das Signal und ruft `clearSession()` →
  `hasPinSession` wird `false` → `PinGate` zeigt automatisch wieder das Tastenfeld.
- Effekt: Jede serverseitige Ablehnung re-gated sauber. Der Timer-Drift wird damit
  irrelevant (kein Angleichen der Timeouts nötig).

**Tests:** `PinGate` (kein Session → Keypad, Session → Inhalt); Tastatur (Ziffern/Enter/
Backspace/Escape); 401-Antwort einer Mutation → Session geleert, Gate erscheint erneut.

---

## Phase B — Settings-Layout (Frontend-only, nach A & C)

**Ziel:** Struktur & Optik gemäß Mockup v2.

Reihenfolge auf der Seite:
1. **Mitglieder** (Card) — Avatare als Kreise mit Initialen; verknüpfte Mitglieder mit
   kleinem grünen ✓; `+` im Kartenkopf öffnet `AddMemberDialog`.
2. **Google-Konten** (Card) — pro Zeile: Mitglied-Avatar (Verknüpfung sichtbar) +
   Name/Email + Status-Badge + **rotes Mülleimer-Icon rechts** (Trennen). Abgelaufen →
   Badge „Verbindung abgelaufen" + „Neu verbinden". `+` im Kartenkopf startet den
   Verbinden-Flow (siehe Phase D).
3. **Kalender** (eigene Card, **eingeklappt**) — Kopf „Kalender · N ausgewählt" mit Chevron;
   aufgeklappt pro Verbindung die Kalenderauswahl (bestehende `ConnectionCalendars`-Logik).
4. **PIN ändern** — ruhiger Text-/Ghost-Button unten (öffnet `ChangePinDialog`).

Komponenten:
- Neue `SectionCard` (Kopf mit Titel + optionaler `+`-Aktion, Token-basiert).
- `MemberSection`, `GoogleAccountsSection`, `CalendarSection` (collapsible) — schlanke
  Aufteilung aus dem heutigen `SettingsView`.
- Icons: `lucide-react` (bereits im Projekt) für Trash/Plus/Chevron.
- Alle betroffenen Komponenten (`GoogleAccountsSettings`, `CalendarManagement`,
  `MemberGrid`/`MemberCard`, Dialoge) auf Theme-Tokens umstellen.

**Tests:** Rendering & Interaktion je Section (Collapse-Toggle, `+`-Aktionen, Trash-Button
löst Disconnect aus), Token-Klassen statt `slate`. `npm run check` grün.

---

## Phase D — Mitglied ↔ Google-Konto-Verknüpfung (Full-Stack, Contract-Change)

**Ziel:** Verbinden hängt ein Google-Konto an ein **bestehendes** Mitglied; kein
Auto-Doppel-Mitglied mehr. Flow: „erst Mitglied wählen, dann OAuth".

### Frontend
- `+` im Google-Block öffnet einen **Mitglied-Picker** (`MemberPickerDialog`, Liste
  bestehender Mitglieder). Auswahl → `startAuth` mit `memberId` → Redirect zu Google.
- `GoogleAccountsSettings.handleConnect/handleReconnect` reichen `memberId` durch.
- `useStartGoogleAuth` / `useCalendars`-Hook um `memberId` erweitern.
- Setup-`ConnectStep`: reicht die `memberId` des im Setup angelegten Mitglieds mit.

### Backend (keine Migration — OAuth-State ist in-memory)
- `OAuthStateEntry` + `OAuthStateStore.create(...)` bekommen `memberId: UUID?`.
- `ConnectionService.startAuthorization(credentialsId, returnUrl, memberId)` speichert
  `memberId` im State.
- `ConnectionService.handleCallback`:
  - Ist `entry.memberId != null` → Verbindung an dieses **bestehende** Mitglied hängen.
  - `existing == null` und `memberId` gesetzt → neue `GoogleConnection` mit
    `familyMemberId = memberId` (kein neues Mitglied anlegen).
  - `memberId == null` (Fallback/Alt-Setup) → bisheriges Auto-Anlegen bleibt erhalten.
- `GoogleAuthController.authorizeGoogle` nimmt den neuen Query-Param entgegen.

### Modell-Entscheidungen (bestätigt)
1. **1 Mitglied ↔ 1 Google-Konto.** Verbindet man für ein Mitglied, das bereits ein Konto
   hat, wird dessen Verbindung **ersetzt** (alte trennen/überschreiben).
2. Ist dasselbe Google-Konto (`googleAccountId`/`sub`) schon einem anderen Mitglied
   zugeordnet, wird es **umgehängt** (Tokens aktualisiert), keine Dublette.
3. `memberId` fehlt → Auto-Anlegen als Fallback.

### Contract
- `api/openapi.yml`: `authorizeGoogle` erhält optionalen Query-Param `memberId`
  (`type: string, format: uuid`). Danach beide Clients neu generieren
  (`openApiGenerate` / `npm run generate:api`).
- **oasdiff:** additiver, optionaler Param → **kein** Breaking Change.

**Tests:**
- Backend: `handleCallback` mit `memberId` — Fälle: neues Konto an bestehendes Mitglied,
  Ersetzen einer vorhandenen Verbindung, Umhängen eines bekannten Kontos, Fallback ohne
  `memberId`. `./gradlew check`.
- Frontend: `MemberPickerDialog`, Start-Flow reicht `memberId` durch. `npm run check`.

---

## Reihenfolge & Abhängigkeiten
1. **A** Theme-Fundament (keine Abhängigkeit)
2. **C** PIN-Gate + Fix (nutzt Tokens aus A für die Optik, funktional unabhängig)
3. **B** Layout-Redesign (braucht A; profitiert von C)
4. **D** Verknüpfung (Full-Stack; UI hängt an B)

Jede Phase ist für sich testbar und **durch die UI erreichbar** (Definition of Done im
Projekt). A–C sind risikoarm (Frontend); D ist der einzige Stack-übergreifende Teil.

## Gesamt-Teststrategie
- Frontend-Gate: `npm run check` (tsc + eslint `--max-warnings 0` + dependency-cruiser +
  100 % Coverage-Schwelle).
- Backend-Gate: `./gradlew check` (Codegen → ktlint/detekt → Tests/Testcontainers →
  JaCoCo).
- Contract: oasdiff bestätigt kein Breaking Change.
- `scripts/pre-commit-check.sh` vor Commit.

## Offene Risiken
- **Coverage 100 %:** neue Zweige (401-Handling, Theme-Default-Pfade, Fallback-Callback)
  brauchen gezielte Tests — im Plan einplanen.
- **Setup-Flow:** `ConnectStep` muss zuverlässig eine gültige `memberId` liefern; Verhalten
  ohne vorhandenes Mitglied im Setup vor Implementierung prüfen.
- **Interims-Inkonsistenz:** Theme-Toggle wirkt anfangs nur auf Settings — bewusst akzeptiert.
