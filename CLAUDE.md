# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository currently contains **only concept documentation** — no code exists yet. The `concept/` folder is a complete requirements specification (Lastenheft) for a ground-up rewrite of FamilyHub, a self-hosted family dashboard. The old system exists elsewhere; this repo is a clean slate.

## What FamilyHub is

A self-hosted family dashboard PWA running as Docker containers on a Synology NAS. Primary use case: a wall-mounted touch display (24/7, no keyboard, finger-only). Key features: shared family calendar synced from Google Calendar, task management synced from Google Tasks, household chores with rotation and gamification (points, streaks, badges, leaderboard), and a photo slideshow from Synology Photos.

Leitprinzip: **Datenhoheit** — runs entirely in the home network. No third-party cloud service except Google (Calendar/Tasks, user-authorised) and a weather API.

## Planned technology stack

| Layer | Technology |
|-------|-----------|
| Backend | Kotlin / Spring Boot 3.x, Java 17, Gradle |
| Frontend | React / TypeScript / Vite (PWA) |
| Database | PostgreSQL (schema managed via Flyway migrations) |
| Runtime | Docker containers on Synology NAS, fronted by nginx |
| API | REST under `/api/v1/`, OpenAPI spec generated |

Redis: explicitly **not** used — drop it from the stack.

## Key architectural decisions (from concept docs)

1. **Backend is the sole integration point.** The frontend never calls Google or the NAS directly. All external credentials stay server-side.
2. **Local mirror of external data.** Google Calendar and Tasks are synced on a schedule into local DB tables. The display keeps working when Google is unreachable.
3. **Configuration in the database, not in files.** Google credentials and NAS access data are stored encrypted in the DB. A browser-based setup wizard handles first-time configuration — no file access on the NAS required.
4. **Flyway for all schema changes.** No automatic Hibernate schema updates.
5. **PIN is a child-safety lock, not a security feature.** Plaintext storage is acceptable. What is *not* acceptable: the PIN being returned by any API endpoint, or the session being enforced only in the frontend. Backend must enforce it.
6. **Photo source behind an abstraction.** The old system had to switch from Google Photos to Synology once already; the new design must make this swappable.
7. **Avatars on a persistent, path-configurable volume.** Include in backup; verify on startup; fall back to default avatar if file missing.

## Concept documentation

All requirements are in `concept/`. Start with `concept/00-README.md` for the index and reading paths.

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

## Recommended build order (from `concept/10-neuauflage.md`)

1. Project scaffold, CI, DB schema, API skeleton, security model
2. Family members, settings, PIN protection, setup wizard
3. Google OAuth + Calendar read/write
4. Calendar view (week + day)
5. Tasks + Google Tasks sync
6. Household chores: templates, rotation, completion
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
