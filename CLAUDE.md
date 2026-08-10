# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Active codebase under construction. Implemented through **Sprint 5** (Tasks + Google Tasks sync — `/tasks` view, bidirectional sync, task lists in settings) on top of the Sprint 4 calendar view (week + day) and the settings overhaul (theme system, full-page PIN gate, section layout, member↔Google link): backend (`backend/`), frontend (`frontend/`), OpenAPI contract (`api/openapi.yml`), and CI (`.github/workflows/ci.yml`) all exist. **Sprint 6 (household chores) is next.** The original requirements spec (Lastenheft) now lives in `docs/concept/` — it is the source of truth for *what* to build; this file plus the code are the source of truth for *how* it is built.

## Build, test & lint commands

Backend (`cd backend`, needs **Java 21** — see gotchas):
- `./gradlew check` — full gate: OpenAPI codegen → compile → ktlint + detekt → tests → JaCoCo coverage verify. Tests use Testcontainers (Docker required).
- `./gradlew test` / `./gradlew bootRun`

Frontend (`cd frontend`, Node ≥ 20):
- `npm run check` — full gate: `tsc --noEmit` + eslint (`--max-warnings 0`) + dependency-cruiser + coverage.
- `npm test` (watch) / `npm run test:run` / `npm run test:e2e` (Playwright) / `npm run generate:api` (orval)

Before committing, run `scripts/pre-commit-check.sh` (backend `./gradlew check` + frontend `npm run check`) — mirrors CI.

## Contract-first workflow

`api/openapi.yml` is the **single source of truth** for the REST API. Do not hand-edit generated clients:
- Backend: `openApiGenerate` (kotlin-spring, interfaces only) → controllers implement generated interfaces.
- Frontend: `orval` generates the typed API client + React Query hooks.
- CI validates the spec and **fails PRs on breaking changes** (oasdiff); use a `breaking-change` label for intentional breaks.

## What FamilyHub is

A self-hosted family dashboard PWA running as Docker containers on a Synology NAS. Primary use case: a wall-mounted touch display (24/7, no keyboard, finger-only). Key features: shared family calendar synced from Google Calendar, task management synced from Google Tasks, household chores with rotation and gamification (points, streaks, badges, leaderboard), and a photo slideshow from Synology Photos.

Leitprinzip: **Datenhoheit** — runs entirely in the home network. No third-party cloud service except Google (Calendar/Tasks, user-authorised) and a weather API.

## Technology stack

| Layer | Technology |
|-------|-----------|
| Backend | Kotlin 2.0.21 / Spring Boot 3.3.5, **Java 21** (Gradle toolchain), Gradle KTS |
| Frontend | React 18 / TypeScript / Vite (PWA), Tailwind, TanStack Query, React Router |
| Database | PostgreSQL (schema managed via Flyway migrations) |
| Runtime | Docker containers on Synology NAS, fronted by nginx |
| API | REST under `/api/v1/`, generated from `api/openapi.yml` |
| Quality | Backend: ktlint + detekt + JaCoCo. Frontend: eslint + dependency-cruiser + vitest/Playwright. |

Redis: explicitly **not** used — drop it from the stack.

## Code layout

- Backend is **package-by-feature** under `com.familyhub` (`members`, `settings`, `pin`, `google/{oauth,calendar,token,crypto,connection,sync,credentials,tasks}`, `shared/{security,health,exceptions}`). An ArchUnit test in `architecture/` enforces module boundaries.
- Flyway migrations live in `backend/src/main/resources/db/migration/` (`V1__…` → `V11__…`). Never edit an applied migration — add a new `V{n}__…` file.
- Frontend is feature-sliced under `frontend/src/` (`features/{calendar,google,members,pin,settings,setup,tasks,theme}`, `api/`, `routing/`).

## Key architectural decisions (from concept docs)

1. **Backend is the sole integration point.** The frontend never calls Google or the NAS directly. All external credentials stay server-side.
2. **Local mirror of external data.** Google Calendar and Tasks are synced on a schedule into local DB tables. The display keeps working when Google is unreachable.
3. **Configuration in the database, not in files.** Google credentials and NAS access data are stored encrypted in the DB. A browser-based setup wizard handles first-time configuration — no file access on the NAS required.
4. **Flyway for all schema changes.** No automatic Hibernate schema updates.
5. **PIN is a child-safety lock, not a security feature.** Plaintext storage is acceptable. What is *not* acceptable: the PIN being returned by any API endpoint, or the session being enforced only in the frontend. Backend must enforce it.
6. **Photo source behind an abstraction.** The old system had to switch from Google Photos to Synology once already; the new design must make this swappable.
7. **Avatars on a persistent, path-configurable volume.** Include in backup; verify on startup; fall back to default avatar if file missing.

## Concept documentation

All requirements are in `docs/concept/`. Start with `docs/concept/00-README.md` for the index and reading paths. Operational guides live alongside in `docs/` (`google-oauth-setup.md`, `synology-https-reverse-proxy.md`, `REVIEW-GUIDE.md`).

| Document | Content |
|----------|---------|
| `01-systemueberblick.md` | Architecture, data flows, system metrics — **start here** |
| `02-funktionale-anforderungen.md` | All user-facing features |
| `03-haushalt-gamification.md` | Chore rotation, points, badges, leaderboard |
| `04-api-referenz.md` | All REST endpoints with request/response detail |
| `05-datenmodell.md` | DB tables, fields, relations, enums, migration history |
| `06-google-integration.md` | OAuth 2.0 flow, sync logic, token management |
| `07-synology-fotos.md` | DSM Web API, slideshow, caching |
| `08-betrieb-und-deployment.md` | Stack versions, Docker setup, config, testing approach |
| `09-nichtfunktionale-anforderungen.md` | Performance, availability, security, accessibility |
| `10-neuauflage.md` | Evaluation of old system + build order recommendation |

Requirements are tagged with IDs like `FA-KAL-01` (functional) or `TA-BUILD-01` (technical). Priority: **MUSS** / **SOLL** / **KANN**. Old-system status: `Umgesetzt` / `Teilweise` / `Prototyp` / `Mock/Dummy` / `Nicht umgesetzt`.

## Recommended build order (from `docs/concept/10-neuauflage.md`)

1. ✅ Project scaffold, CI, DB schema, API skeleton, security model
2. ✅ Family members, settings, PIN protection, setup wizard
3. ✅ Google OAuth + Calendar read/write
4. ✅ Calendar view (week + day) — incl. agenda list, reminders, recurring events, member colours
5. ✅ Tasks + Google Tasks sync
6. Household chores: templates, rotation, completion ← *current*
7. Gamification: points, streaks, badges, leaderboard
8. Synology Photos + slideshow (with thumbnail-sized images, never originals)
9. Kiosk mode, on-screen keyboard, themes, weather
10. Production readiness: backup, update path, load test

A feature is only done when it is **reachable through the UI, tests are green, and CI passes**.

## UI conventions

- **German-language UI throughout** — quote German strings as they appear when documenting UI text
- Touch targets ≥ 44 × 44 px, no hover-only interactions
- Large text, high contrast (viewing distance 1–3 m)
- No classic login/sessions — actions are attributed to family members explicitly; only PIN-protected areas require a (server-validated) session token

## What FamilyHub is NOT

- No multi-tenant support (one installation = one family)
- No user accounts or password-based login
- Not designed for internet exposure (LAN only; VPN if remote access is wanted)
- No smart-home integration, no media management

## Gotchas

- **Backend needs Java 21.** `./gradlew` fails with `IllegalArgumentException: 25.0.3` if `JAVA_HOME` points elsewhere — point it at a JDK 21 first.
- **Backend tests require Docker** (Testcontainers spins up PostgreSQL).
- **Never hand-edit generated API code** — change `api/openapi.yml` and regenerate (see contract-first workflow above).
