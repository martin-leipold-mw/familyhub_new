# FamilyHub — Review-Guide (Agentic Coding School Zertifizierung)

> Spickzettel für das ~30-minütige Review-Meeting mit den Trainern.
> Beantwortet für jedes Kurs-Konzept: **Was ist es, wo ist es im Repo definiert, was sage ich dazu.**
> Alle Pfade relativ zur Repo-Wurzel `FamilyHub_new/`.

---

## 1. Das Projekt in 30 Sekunden

**FamilyHub** — selbst gehostetes Familien-Dashboard als PWA für ein wandmontiertes Touch-Display (Kiosk, 24/7). Läuft als Docker-Container auf einer Synology NAS. Features: Familienkalender (Google-Sync), Aufgaben (Google Tasks), Haushalts-Chores mit Gamification, Foto-Slideshow (Synology Photos). Leitprinzip: **Datenhoheit** — alles im Heimnetz, Backend ist der einzige Integrationspunkt nach außen.

| Layer | Technologie |
|---|---|
| Backend | Kotlin / Spring Boot 3.x, Java 21, Gradle |
| Frontend | React / TypeScript (strict) / Vite, PWA |
| API-Vertrag | `api/openapi.yml` — Contract-first, Codegen beidseitig |
| Datenbank | PostgreSQL, Schema ausschließlich via Flyway |
| Betrieb | Docker Compose auf Synology NAS, nginx vor dem Frontend |

**Stand:** 3 Sprints abgeschlossen bzw. fast abgeschlossen — (1) Scaffold + CI + Test-Harness, (2) Members/Settings/PIN/Setup-Wizard (Backend + Frontend), (3) Google OAuth + Kalender-Sync (27/28 Tasks, offen: Task 28 „Full run + CI gate").

---

## 2. Architektur auf einen Blick

### 2.1 System-Architektur

```
                     Heimnetz (LAN only, kein Internet-Exposure)
 ┌─────────────────────────────────────────────────────────────────────┐
 │                                                                     │
 │   Wall-Display (Touch, Kiosk)          Synology NAS (Docker)        │
 │  ┌──────────────────────────┐   ┌────────────────────────────────┐  │
 │  │  React-PWA (Frontend)    │   │  nginx ──► Frontend-Container  │  │
 │  │  - generierter API-      │   │              │                 │  │
 │  │    Client (orval)        │◄──┤              ▼ /api/v1         │  │
 │  │  - X-Pin-Session-Header  │   │  Backend (Spring Boot/Kotlin)  │  │
 │  └──────────────────────────┘   │   Controller ─► Service ─►     │  │
 │                                 │   Repository (ArchUnit-Gate)   │  │
 │        Frontend ruft NIE        │              │                 │  │
 │        Google/NAS direkt auf!   │              ▼                 │  │
 │                                 │  PostgreSQL (Flyway V1..V8)    │  │
 │                                 │  - Google-Creds VERSCHLÜSSELT  │  │
 │                                 │    in DB (EncryptionService)   │  │
 │                                 └───────┬──────────────┬─────────┘  │
 │                                         │              │            │
 └─────────────────────────────────────────┼──────────────┼────────────┘
                                           ▼              ▼
                                  Google Calendar/    Synology Photos
                                  Tasks (OAuth 2.0    (DSM API, nur
                                  + PKCE, lokaler     Thumbnails)
                                  DB-Mirror/Sync)
```

**Kernentscheidungen** (alle in `CLAUDE.md` + `docs/concept/`):
Backend = einziger Integrationspunkt · lokaler Mirror externer Daten (Display funktioniert ohne Google) · Konfiguration verschlüsselt in der DB statt in Files (Setup-Wizard im Browser) · PIN = Kindersicherung, aber **serverseitig** erzwungen (`@RequiresPinSession`, PIN nie in einer API-Response) · Foto-Quelle hinter Abstraktion · kein Redis, keine User-Accounts, kein Multi-Tenant.

### 2.2 Contract-First-Fluss (wichtig für Review-Fragen zur API)

```
            api/openapi.yml  (Single Source of Truth)
              │                              │
   openApiGenerate (Gradle)            orval (npm run generate:api)
              ▼                              ▼
 backend: com.familyhub.generated.*   frontend: src/api/generated/*
   (Kotlin-Spring-Interfaces)           (typed hooks + customFetch)
              │                              │
   beide Bäume: gitignored + regeneriert; Hand-Edits per
   .claude/settings.json permissions.deny VERBOTEN
              │
   CI-Gate: openapi-generator validate + oasdiff (Breaking Changes ⇒ fail)
```

### 2.3 Agentic-Setup-Architektur (das eigentliche Review-Thema)

```
 ┌──────────────────── Claude Code Session ────────────────────┐
 │                                                             │
 │  CLAUDE.md (Instruction File, ~84 Zeilen)                   │
 │    └─ Progressive Disclosure ─► docs/concept/00..10 (Specs) │
 │                                                             │
 │  Superpowers SDD-Workflow (Brainstorm→Design→Plan→Tasks):   │
 │    docs/superpowers/specs/*.md   (Research/Design-Docs)     │
 │    docs/superpowers/plans/*.md   (Pläne, bite-sized Tasks)  │
 │    .superpowers/sdd/progress.md  (Ledger = ext. Gedächtnis) │
 │    .superpowers/sdd/task-N-brief/-report, review-*.diff     │
 │                                                             │
 │  Subagenten:                                                │
 │    Implementer pro Task (frischer Kontext, Red-Green-Ref.)  │
 │    .claude/agents/code-reviewer.md (read-only, 2nd stage)   │
 │                                                             │
 │  Backpressure-Kaskade (siehe §4):                           │
 │    Stufe 1  PostToolUse-Hook  ESLint pro geänderter Datei   │
 │    Stufe 2  Stop-Hook         Compile + Type-Check          │
 │    Stufe 3  PreToolUse-Hook   git-Guard (--no-verify, -f)   │
 │    + permissions.deny         generierte Files, force-push  │
 │    + pre-commit (git)         volle Gates lokal             │
 │    + CI (GitHub Actions)      Tests, Coverage, oasdiff, E2E │
 └─────────────────────────────────────────────────────────────┘
```

---

## 3. „Wo ist … definiert?" — Schnellreferenz

| Kurs-Konzept | Datei(en) im Repo | Ein-Satz-Antwort im Review |
|---|---|---|
| **Instruction File** | `CLAUDE.md` | What/Why/How-Aufbau, <300 Zeilen, verlinkt statt inlinet (Progressive Disclosure auf `docs/concept/`). |
| **Backpressure** | `.claude/settings.json` (Hooks-Verdrahtung) + `.claude/hooks/check-changed.sh`, `verify-done.sh`, `git-guard.sh` + `scripts/pre-commit-check.sh` + `.github/workflows/ci.yml` + Gates in `backend/build.gradle.kts` / `frontend/package.json` | Dreistufige Hook-Kaskade in der Session, Pre-Commit lokal, CI als letzte Instanz — Details in §4. |
| **Custom Subagent** | `.claude/agents/code-reviewer.md` | Fokussierter Read-only-Reviewer: nur Read/Grep/Glob/Bash, kennt die Projekt-Guardrails (Contract-first, PIN, Layering), versioniert im Repo. |
| **Research / Design-Docs** | `docs/superpowers/specs/*.md` (4 Stück) | Research vor Plan — z. B. `2026-07-23-schritt3-google-oauth-kalender-design.md`. |
| **Pläne (Plan → Implement)** | `docs/superpowers/plans/*.md` (4 Stück) | Reviewte Pläne mit exakten Dateien, Code und Verifikationsschritten pro Task; menschlicher Review-Checkpoint vor Implementierung. |
| **Kontext-Management / Frequent Intentional Compaction** | `.superpowers/sdd/progress.md` (Ledger) + Task-Briefs/-Reports | File-based State: jeder Task startet mit frischem Kontext aus Brief + Ledger statt aufgeblähter Session („smart zone"). |
| **Review-Loops (strict reviews)** | `.superpowers/sdd/review-*.diff` (~70 Stück) + Ledger-Einträge | 2-stufiges Review pro Task (Spec-Compliance + Code-Qualität), Findings mit Severity, Fix-Loops dokumentiert. |
| **Spec/Anforderungen** | `docs/concept/00-README.md` … `10-neuauflage.md` | 12 Dokumente Lastenheft mit Requirement-IDs (`FA-KAL-01`), Prioritäten MUSS/SOLL/KANN. |
| **Docs im Codebase** | `docs/` komplett + `INSTALLATION.md`, `README.md`, `docs/google-oauth-setup.md`, `docs/synology-https-reverse-proxy.md` | Agent kann alles selbst explorieren — Slide „Keep docs in your codebase". |
| **Guardrails / Permissions** | `.claude/settings.json` → `permissions.deny` | Kein Edit/Write auf generierte Client-/Server-Stubs, kein `--no-verify`, kein `push --force` (nur `--force-with-lease`). |
| **Definition of Done** | `CLAUDE.md` (unten) + `code-reviewer.md` | „Feature ist fertig, wenn es über die UI erreichbar ist, Tests grün sind und CI passt." |
| **Debugging-Journal / Iterative Fix Tracking** | Statuslog-Einträge in `.superpowers/sdd/progress.md` | z. B. Testcontainers-Lifecycle-Bug (INFRA FIX, Commit 284844c): Symptom → Hypothese → Fix → Verifikation, inkl. Warnung an zukünftige Tasks. |
| **Harness/Compound Engineering** | „Carry-forward"-Notizen & Amendments im Ledger | Erkenntnisse (z. B. `isEqualTo(NNN)` statt `value(NNN)`, Java-21-Pflicht) fließen als Regeln in Folge-Tasks zurück. |

---

## 4. Backpressure im Detail (häufigste Trainer-Frage)

**Definition aus dem Kurs:** automatisierte Feedback-Mechanismen, die dem Agenten Fehler *sofort in den Kontext* zurückspielen, statt auf menschliches Review zu warten.

### Die Kaskade — von schnell/lokal nach langsam/global

| Stufe | Wann | Was | Definiert in | Design-Begründung |
|---|---|---|---|---|
| 1 | **PostToolUse** (nach jedem Edit/Write) | ESLint `--max-warnings 0` nur auf der geänderten Datei; Exit 2 ⇒ Fehler landet direkt im Agent-Kontext | `.claude/hooks/check-changed.sh` | Muss <
ein paar Sekunden bleiben; generierte Files ausgenommen |
| 2 | **Stop** (Agent will Turn beenden) | `tsc --noEmit` + `gradlew compileKotlin compileTestKotlin`; Exit 2 ⇒ Agent MUSS erst grün machen | `.claude/hooks/verify-done.sh` | **Bewusst schlank**: keine Testcontainers/Coverage pro Turn (Minuten + Flake-Risiko) — das ist Context-Efficient Backpressure aus Tag 2 |
| 3 | **PreToolUse** (vor jedem Bash) | Blockt `--no-verify`, `git commit -n`, `push --force/-f` **überall im Command** (schließt die Präfix-Lücke der deny-Regeln); `--force-with-lease` bleibt erlaubt | `.claude/hooks/git-guard.sh` | Agent kann seine eigene Backpressure nicht umgehen |
| — | Permission-Ebene | deny auf `git commit --no-verify`, `push --force`, Edit/Write auf `frontend/src/api/generated/**` & `backend/build/generated/**` | `.claude/settings.json` | Contract-first wird technisch erzwungen |
| — | **pre-commit** (git) | `./gradlew check` (Tests + Coverage) + `npm run check` (tsc + eslint + Coverage) | `scripts/pre-commit-check.sh` (Installation: `README.md`) | Volles Gate einmal pro Commit statt pro Turn |
| — | **CI** (GitHub Actions) | OpenAPI-Validate → oasdiff-Breaking-Change-Gate → Backend `gradlew check` (Testcontainers) → Frontend `npm run check` + Build → Playwright E2E → Docker-Images | `.github/workflows/ci.yml` | Einmal pro PR „wehtun" statt einmal pro Turn |

### Statische Gates hinter `check`

- **Backend:** ktlint + detekt (`backend/config/detekt/`), ArchUnit (Layering Controller→Service→Repository), JaCoCo **100 % Branch / ≥90 % Line** (`backend/build.gradle.kts`).
- **Frontend:** strict tsc, ESLint `--max-warnings 0`, dependency-cruiser, Vitest-Coverage **100 % Branches/Lines/Functions/Statements** (`frontend/package.json`, `vite.config.ts`).
- **Typisierte Sprachen** (Kotlin, strict TypeScript) und **Schema-Validierung** (OpenAPI + oasdiff, Flyway-only-DDL mit `ddl-auto=validate`) sind Backpressure per Design — genau die sechs Kategorien der Definitions-Slide.

---

## 5. Workflow zeigen: so lief ein Sprint (RPI/SDD live erklären)

1. **Brainstorm/Research** → Design-Doc in `docs/superpowers/specs/` (z. B. Google-OAuth-Design, 26 KB).
2. **Plan** → reviewter Plan in `docs/superpowers/plans/` mit Task-Zerlegung (Sprint 3: 28 Tasks), exaktem Code & Verifikation pro Task. **Human Review vor Implementierung** (Slide „Human in the Loop": guter Plan ⇒ guter Code).
3. **Implement** → pro Task ein Subagent mit frischem Kontext (Brief rein, Report raus), Red→Green→Refactor.
4. **Review** → 2-stufig: Spec-Compliance + Code-Qualität; Diffs in `.superpowers/sdd/review-*.diff`; Fix-Loops bis „Approved".
5. **Ledger** → `.superpowers/sdd/progress.md` hält Status, akzeptierte Abweichungen, Carry-forward-Regeln, abgelehnte False-Positives — das externe Gedächtnis über Session-Grenzen.
6. **Merge** erst nach Whole-Branch-Final-Review (Opus) + grünem Gesamtgate.

**Vorzeigbare Highlights aus dem Ledger** (falls nach echten Effekten gefragt wird):
- Flow-Integrationstest fand echten Bug: `JacksonConfig.modules()` verdrängte das KotlinModule (Sprint 2, Task 11).
- Implementer fand & fixte React-Key-Remount-Bug im PIN-Wizard (stale Digits zwischen Phasen) — Regel wurde als „CARRY TO T12" ins Ledger geschrieben und dort wiederverwendet ⇒ Compound Engineering.
- Reviewer-Findings wurden auch **abgelehnt** mit Begründung (False-Positives dokumentiert) — kein blindes Agent-Vertrauen.
- Warnung im Ledger: Implementer haben zweimal echte Testfehler als „no DB in sandbox" wegdiskutiert ⇒ Regel „always verify full suite myself".

---

## 6. Zahlen & Fakten (für die Glaubwürdigkeit)

- 3 Sprints: 12 + (11 Backend & 13 Frontend) + 28 Tasks; Sprint 3 bei 27/28.
- Frontend-Gate: 127+ Tests, **100 %** Branches/Lines/Functions/Statements; Backend: 76+ Tests, **100 % Branch** / ≥90 % Line (Sprint-2-Stand).
- ~70 archivierte Review-Diffs, 4 Pläne (60–103 KB), 4 Design-Specs, 12 Konzept-Dokumente mit Requirement-IDs.
- Testpyramide: Unit (Vitest/JUnit+MockK) → Integration (Testcontainers-Postgres, Singleton-Pattern) → E2E (Playwright, nur CI).

---

## 7. Bekannte Lücken — und was ich dazu sage

| Lücke | Ehrliche Antwort | Fix vor dem Review? |
|---|---|---|
| `CLAUDE.md` veraltet („noch kein Code", `concept/` statt `docs/concept/`, Java 17 statt 21) | Bewusster Befund aus eigenem Review — verstößt gegen „Setup constantly updated"; zeigt, dass ich den Punkt verstanden habe | **Ja, unbedingt** (10 min Aufwand, größter Hebel) |
| Keine Custom Slash Commands / keine `.claude/skills/` | Funktional durch Superpowers-Skills abgedeckt (SDD-Workflow = „Advanced Workflows"-Slide); ein kleiner `/commit`-Command wäre trotzdem ein guter Nachtrag | Optional, nice-to-have |
| Kein Remote → Homework verlangt Push in die School-Subgroup „Homework" | Repo war bisher local-only; CI (`ci.yml`) ist definiert, aber noch nie real gelaufen | **Ja** — pushen, CI einmal grün laufen lassen |
| Sprint 3, Task 28 („Full run + CI gate") offen | Transparent im Ledger; letzter Verifikationsschritt des Branches | Idealerweise vorher abschließen |

---

## 8. Mini-FAQ fürs Meeting (Frage → wohin zeigen)

- „Zeig mir deine Backpressure." → §4-Tabelle, dann live `.claude/settings.json` + die drei Hooks öffnen.
- „Wie planst du, bevor du implementierst?" → `docs/superpowers/plans/2026-07-23-schritt3-google-oauth-kalender.md` aufmachen, Task-Struktur zeigen, dann Ledger.
- „Wie hältst du den Kontext klein?" → Subagent-pro-Task + Ledger statt Mega-Session (§5, Punkt 3+5); Stop-Hook bewusst ohne Testcontainers (Kommentar in `verify-done.sh` vorlesen — die Begründung steht im File).
- „Wo sind deine Subagenten?" → `.claude/agents/code-reviewer.md` (custom, versioniert) + Implementer-Subagenten des Superpowers-Workflows.
- „Was hast du gegen Vibe Coding getan?" → Contract-first + Coverage-Gates + reviewte Pläne + dokumentierte abgelehnte Reviewer-Findings; ich kann jede Architekturentscheidung aus `docs/concept/` begründen.
- „Was würdest du als Nächstes verbessern?" → §7 (CLAUDE.md-Refresh, `/commit`-Skill, Push + CI-Run, Task 28).
