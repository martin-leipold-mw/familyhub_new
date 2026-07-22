# FamilyHub — Tech-Stack & Architektur Design

**Datum:** 2026-07-21  
**Status:** Approved  
**Scope:** Vollständiger Tech-Stack, Repo-Struktur, CI/CD-Pipeline und Backend-Architektur für die Neuauflage von FamilyHub

---

## 1. Kontext & Entscheidungsrahmen

FamilyHub ist ein selbst gehostetes Familien-Dashboard als PWA, das auf einer Synology NAS in Docker-Containern läuft. Primäres Zielgerät ist ein wandmontiertes Touch-Display (24/7, Kiosk-Modus). Das Altsystem wird vollständig neu gebaut; die fachlichen Anforderungen sind in `concept/` dokumentiert.

**Treibende Kriterien für die Tech-Stack-Wahl:**
- Läuft als Docker-Container auf einer Synology NAS mit begrenztem RAM
- Hintergrundprozesse (Google-Sync alle 15 min, Haushaltsaufgaben-Generierung um Mitternacht) müssen zuverlässig laufen
- Deployment soll automatisch nach jedem Push auf `main` erfolgen
- Einzel-Entwickler-Projekt → Komplexität muss gerechtfertigt sein
- Entwickler ist im JVM-Umfeld stärker als im Node-Backend-Umfeld

**Verworfene Alternativen:**
- **Next.js Full-Stack:** Kein nativer Support für Hintergrundprozesse (Scheduler); externe Lösung für Cron-Jobs nötig.
- **Go / Node.js Backend:** Leichtgewichtiger, aber weniger vertrautes Ökosystem für diesen Entwickler.
- **Java 25:** Zu neu zum Zeitpunkt der Entscheidung; Java 21 LTS ist battle-tested mit Spring Boot 3.3+.
- **Redis:** Wird nicht benötigt; alle Caches sind prozesslokal oder clientseitig (Befund aus Altsystem-Analyse).
- **Separates Frontend/Backend-Repository:** Overhead nicht gerechtfertigt für Einzel-Entwickler.

---

## 2. Architekturprinzipien: CUPID

Die Architektur folgt den CUPID-Prinzipien (Dan North) statt klassischem SOLID:

| Prinzip | Umsetzung |
|---------|-----------|
| **C**omposable | Module nutzen sich nur über klar definierte Service-Interfaces — nie direkte Repository-Zugriffe cross-domain |
| **U**nix philosophy | Jedes Domain-Modul macht eine Sache: `CalendarModule` kennt keine Punkte, `GamificationModule` kennt kein Google |
| **P**redictable | Konsistente Fehlerbehandlung überall, UTC-Timestamps durchgehend, einheitliche API-Response-Struktur |
| **I**diomatic | Echter Kotlin-Stil: `data class`, `sealed class`, Extension Functions — kein Java-in-Kotlin |
| **D**omain-based | Package-by-Domain, nicht Package-by-Layer |

**Modul-Kommunikation:** Wenn `HouseholdService` eine Aufgabe als erledigt markiert, feuert es ein `TaskCompletedEvent` (Spring `ApplicationEvent`). `GamificationService` hört darauf — aber die beiden Module haben keine direkte Abhängigkeit.

---

## 3. Vollständiger Tech-Stack

### Backend

| Komponente | Technologie | Version |
|------------|-------------|---------|
| Sprache | Kotlin | 2.x |
| Framework | Spring Boot | 3.3.x |
| Java Runtime | Eclipse Temurin | 21 LTS |
| Build | Gradle (Kotlin DSL) | 8.x |
| Persistence | Spring Data JPA + Hibernate | via Boot BOM |
| DB-Migrationen | Flyway | 10.x |
| Sicherheit | Spring Security (PIN-Session) | via Boot BOM |
| Scheduler | Spring `@Scheduled` | built-in |
| HTTP-Client | Spring `RestClient` | via Boot BOM |
| API-Spec | OpenAPI 3.1 | — |
| Server-Stubs | openapi-generator (Spring) | 7.x |
| Unit-Tests | JUnit 5 + MockK + SpringMockK | — |
| Integrationstests | Testcontainers (PostgreSQL) | — |

### Datenbank

| Komponente | Technologie | Version |
|------------|-------------|---------|
| Datenbank | PostgreSQL | 16-alpine |
| Schema-Management | Flyway | 10.x |

Redis: **nicht verwendet**. Alle Caches sind prozesslokal (In-Memory-Maps im Backend) oder clientseitig (IndexedDB im Browser).

### Frontend

| Komponente | Technologie | Version |
|------------|-------------|---------|
| Sprache | TypeScript (strict mode) | 5.x |
| Framework | React | 18.x |
| Build-Tool | Vite | 7.x |
| PWA | vite-plugin-pwa | — |
| Routing | React Router | 6.x |
| Server-State | TanStack Query v5 | — |
| UI-Komponenten | shadcn/ui + Radix UI | — |
| Styles | Tailwind CSS | 3.x |
| API-Client | openapi-generator (TypeScript-fetch) | generiert |
| Unit-Tests | Vitest + Testing Library | — |
| TypeScript strict | `strict: true`, `noUnusedLocals: true` | — |

### Infrastruktur

| Komponente | Technologie |
|------------|-------------|
| Reverse Proxy | nginx (alpine, Frontend-Container) |
| Containerisierung | Docker Compose |
| CI/CD | GitHub Actions |
| Container-Registry | GHCR (GitHub Container Registry, kostenlos) |
| Auto-Deploy NAS | Watchtower |
| Laufzeit-Plattform | Synology NAS, DSM 7.x, Container Manager |

---

## 4. API-First-Ansatz

Die `api/openapi.yml` ist der einzige Source of Truth für alle REST-Endpunkte.

```
api/openapi.yml
    │
    ├─▶ openapi-generator (Kotlin/Spring)
    │       └── Backend: Controller-Interfaces + DTOs
    │           Backend implementiert die Interfaces — nie direkter Mismatch möglich
    │
    └─▶ openapi-generator (TypeScript-fetch)
            └── Frontend: typisierter API-Client
                Kein manuelles `fetch`, kein Request-Body-Raten
```

**Invariante:** Ein Breaking Change in `openapi.yml` bricht den TypeScript-Compile im Frontend. Das wird von der CI-Pipeline erzwungen (`tsc --noEmit` nach Code-Generierung).

Die 112 REST-Endpunkte aus `concept/04-api-referenz.md` sind der initiale Input für die Spec.

---

## 5. Backend-Paketstruktur

Package-by-Domain (CUPID: **D**omain-based). Keine technischen Top-Level-Pakete wie `controllers/` oder `services/`.

```
com.familyhub
├── calendar/
│   ├── CalendarController.kt       # implementiert generated Interface
│   ├── CalendarService.kt
│   ├── CalendarRepository.kt
│   ├── CalendarEvent.kt            # JPA-Entity (Domain-Model)
│   └── dto/                        # generiert via openapi-generator
│
├── tasks/
│   ├── TaskController.kt
│   ├── TaskService.kt
│   ├── TaskRepository.kt
│   └── GoogleTask.kt
│
├── household/
│   ├── HouseholdController.kt
│   ├── TaskTemplateService.kt
│   ├── TaskInstanceService.kt
│   ├── RotationService.kt
│   ├── TaskTemplate.kt             # JPA-Entity
│   ├── TaskInstance.kt             # JPA-Entity
│   └── events/
│       └── TaskCompletedEvent.kt   # Domain Event → Gamification
│
├── gamification/
│   ├── GamificationController.kt
│   ├── GamificationService.kt      # @EventListener(TaskCompletedEvent)
│   ├── PointsRepository.kt
│   ├── BadgeRepository.kt
│   └── LeaderboardService.kt
│
├── photos/
│   ├── PhotosController.kt
│   ├── SynologyPhotosService.kt
│   └── PhotoSource.kt              # Interface → austauschbar (Synology / lokal)
│
├── members/
│   ├── MemberController.kt
│   ├── MemberService.kt
│   ├── MemberRepository.kt
│   ├── FamilyMember.kt             # JPA-Entity
│   └── AvatarService.kt
│
├── google/
│   ├── auth/
│   │   ├── GoogleAuthController.kt
│   │   ├── GoogleAuthService.kt
│   │   └── GoogleCredentialsRepository.kt
│   └── sync/
│       ├── CalendarSyncService.kt  # @Scheduled alle 15 min
│       └── TasksSyncService.kt     # @Scheduled alle 15 min
│
├── settings/
│   ├── SettingsController.kt
│   ├── SettingsService.kt
│   ├── SetupWizardController.kt
│   ├── PinService.kt
│   └── Setting.kt                  # JPA-Entity (key/value)
│
├── weather/
│   ├── WeatherController.kt
│   └── WeatherService.kt           # In-Memory-Cache, 10/30 min TTL
│
└── shared/
    ├── security/
    │   ├── SecurityConfig.kt
    │   └── PinSessionFilter.kt
    ├── config/
    │   ├── WebConfig.kt            # CORS
    │   └── JacksonConfig.kt        # UTC, ISO-8601
    ├── exceptions/
    │   ├── GlobalExceptionHandler.kt
    │   └── ErrorResponse.kt        # { code, message, correlationId }
    └── health/
        └── HealthController.kt     # /api/health inkl. DB-Check
```

---

## 6. Repo-Struktur (Monorepo)

```
familyhub/
├── api/
│   └── openapi.yml                 # Single Source of Truth für alle REST-Endpunkte
│
├── backend/
│   ├── build.gradle.kts
│   ├── Dockerfile
│   └── src/
│       ├── main/kotlin/com/familyhub/
│       ├── main/resources/
│       │   ├── application.yml
│       │   └── db/migration/       # Flyway V1__*.sql …
│       └── test/
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── api/                    # generierter TypeScript-Client (nicht einchecken)
│       ├── components/
│       ├── features/               # Feature-Ordner analog zu Backend-Domains
│       └── ...
│
├── docker-compose.yml              # Produktion (GHCR-Images)
├── docker-compose.dev.yml          # Lokale Entwicklung (lokale Builds)
├── .env.example                    # Vorlage, keine Secrets
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── INSTALLATION.md                 # Einzige Installationsanleitung
└── CLAUDE.md
```

**Regel:** Generierter Code (`frontend/src/api/`, `backend/src/main/kotlin/.../dto/`) wird **nicht** eingecheckt. Er wird in der CI und lokal via Gradle/npm-Task erzeugt.

---

## 7. CI/CD Pipeline

### GitHub Actions (`ci.yml`)

```
Trigger: push auf main, PR auf main

Jobs (parallel wo möglich):
│
├── validate-spec
│       openapi-generator validate api/openapi.yml
│
├── build-backend   (braucht: validate-spec)
│       ./gradlew generateOpenApiCode
│       ./gradlew build            # compile + test + Flyway-Migration-Test
│       Docker build → ghcr.io/[user]/familyhub-backend:latest + :[sha]
│       Docker push (nur auf main)
│
└── build-frontend  (braucht: validate-spec)
        npm ci
        npm run generate:api        # openapi-generator TypeScript-Client
        tsc --noEmit                # Typprüfung inkl. generiertem Client
        npm run lint
        npm run test:run
        npm run build
        Docker build → ghcr.io/[user]/familyhub-frontend:latest + :[sha]
        Docker push (nur auf main)
```

### Deployment auf NAS (Watchtower)

Watchtower läuft als zusätzlicher Container in `docker-compose.yml` und pollt GHCR alle 5 Minuten. Bei neuen Images: `docker-compose pull && restart` automatisch.

```yaml
# Auszug docker-compose.yml
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - WATCHTOWER_POLL_INTERVAL=300
    - WATCHTOWER_CLEANUP=true
  restart: unless-stopped
```

---

## 8. Docker Compose Konfiguration

### Produktion (`docker-compose.yml`)

- Nur **ein Port** nach außen: Frontend auf `3080`
- Backend, PostgreSQL: nur im internen Docker-Netz erreichbar
- `restart: unless-stopped` für alle Dienste
- `env_file: .env` für alle Dienste mit Secrets
- Volumes: `postgres_data` + `avatar_data` (kein Datenverlust bei Updates)
- `TZ=Europe/Berlin` in allen Containern (Cron-Läufe zur erwarteten Ortszeit)

### Lokale Entwicklung (`docker-compose.dev.yml`)

- Nur PostgreSQL als Container
- Backend via `./gradlew bootRun`
- Frontend via `npm run dev`
- Hot-Reload für beide Seiten

---

## 9. Konfigurationsebenen

| Ebene | Inhalt | Ort |
|-------|--------|-----|
| Infrastruktur | DB-Zugang, Verschlüsselungsschlüssel, Ports | `.env` → `env_file` in Compose |
| Anwendung | Timeouts, Avatar-Pfad, Sync-Intervall | `application.yml` mit `${ENV_VAR:default}` |
| Fachlich | Slideshow-Config, Wetter-API-Key, Synology-URL, PIN | `settings`-Tabelle in DB (Setup-Wizard) |

**Invariante:** Startet die Anwendung mit einem Default-Verschlüsselungsschlüssel, bricht sie den Start ab (Startup-Validierung in `@PostConstruct`).

---

## 10. Explizit ausgeklammert

Diese Entscheidungen sind bewusst für später aufgeschoben:

- Konkrete OpenAPI-Spec-Inhalte (folgen aus Konzeptdoku)
- Flyway-Migrations-Inhalte (folgen aus Datenmodell-Spec)
- Frontend-Routing-Struktur und Komponentenhierarchie
- Gamification-Detaillogik (steht in `concept/03-haushalt-gamification.md`)
- Google OAuth Flow im Detail (steht in `concept/06-google-integration.md`)
- Synology Photos DSM-API-Details (steht in `concept/07-synology-fotos.md`)
