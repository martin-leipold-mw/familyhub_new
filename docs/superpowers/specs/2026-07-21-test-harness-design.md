# FamilyHub Test-Harness Design

**Datum:** 2026-07-21  
**Scope:** Erweiterung des Scaffold-Plans (`2026-07-21-project-scaffold.md`) um ein vollständiges Test-Harness mit Coverage-Enforcement, Playwright E2E und Pre-Commit-Gate.

---

## Ziele

- Backend: ≥ 90 % Line Coverage, 100 % Branch Coverage auf Anwendungscode
- Frontend: ≥ 90 % Line/Function/Statement Coverage, 100 % Branch Coverage auf Anwendungscode
- Frontend E2E: Playwright gegen Vite Dev Server + MSW
- Enforcement: `./gradlew check` / `npm run check` lokal (Pre-Commit-Hook) und in CI
- Schneller TDD-Zyklus bleibt erhalten: `./gradlew test` / `npm run test:run` ohne Coverage-Gate

---

## Entscheidungen

| Frage | Entscheidung | Begründung |
|-------|-------------|------------|
| Backend Integration Tests | MockMvc (kein RestAssured) | Ausreichend für Controller-Tests; kein Mehrwert durch echten HTTP-Stack im Scaffold |
| Blackbox-Semantik Backend | `@SpringBootTest` + Testcontainers PostgreSQL | Echter Spring-Kontext + echter DB-Container = ausreichend "blackbox" für Integrationsebene |
| Frontend E2E Backend | Vite Dev Server + MSW | Kein laufendes Backend nötig; schnell, self-contained in CI |
| Coverage-Gate lokal | Nur bei `check`, nicht bei `test` | TDD-Zyklus soll nicht durch Coverage-Gate gebremst werden |
| Pre-Commit-Enforcement | Manuell installierter Git-Hook (kein Husky) | Kein extra Tooling; ein `cp`-Befehl, in README dokumentiert |
| E2E in Pre-Commit | Nein | Zu langsam für jeden Commit; läuft nur in CI |
| Coverage-Exclusions | Generierter Code, Entry Points, Config, shadcn/ui | Diese Klassen haben keine testbare Geschäftslogik |

---

## Section 1: Backend — JaCoCo Coverage

### Exclusion-Regel

Identische Exclusion-Liste für `jacocoTestReport` und `jacocoTestCoverageVerification`:

```
**/Application*
**/generated/**
**/config/**
**/exceptions/ErrorResponse*
```

Begründung der Ausschlüsse:
- `Application*` — Spring Boot Entry Point, keine Logik
- `generated/**` — OpenAPI-generierter Code unter `build/generated/openapi/`
- `config/**` — `@Configuration`/`@Bean`-Klassen (WebConfig, JacksonConfig, SecurityConfig); Spring-Infrastruktur, keine Branches in Anwendungslogik
- `ErrorResponse` — Kotlin `data class` ohne Logik; compiler-generierte `equals`/`hashCode`-Branches

### `build.gradle.kts` Ergänzungen

```kotlin
tasks.jacocoTestReport {
    dependsOn(tasks.test)
    val excludedClasses = listOf(
        "**/Application*",
        "**/generated/**",
        "**/config/**",
        "**/exceptions/ErrorResponse*",
    )
    classDirectories.setFrom(
        sourceSets.main.get().output.asFileTree.matching {
            exclude(excludedClasses)
        }
    )
    reports {
        xml.required = true
        html.required = true
    }
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.jacocoTestReport)
    val excludedClasses = listOf(
        "**/Application*",
        "**/generated/**",
        "**/config/**",
        "**/exceptions/ErrorResponse*",
    )
    classDirectories.setFrom(
        sourceSets.main.get().output.asFileTree.matching {
            exclude(excludedClasses)
        }
    )
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = 0.90.toBigDecimal()
            }
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = 1.00.toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}
```

### Task-Semantik

| Befehl | Wirkung |
|--------|---------|
| `./gradlew test` | Tests ausführen + JaCoCo-Report generieren; kein Coverage-Gate |
| `./gradlew check` | Tests + Report + Coverage-Verifikation; bricht bei < 90 % Lines oder < 100 % Branches ab |

---

## Section 2: Frontend — Vitest Coverage Thresholds

### Exclusion-Strategie

```
node_modules/
src/test/
**/*.d.ts
src/components/ui/        ← shadcn/ui generierte Komponenten
src/api/generated/        ← orval-generierter API-Code
src/main.tsx              ← Entry Point
```

### `vite.config.ts` Ergänzung (unter `test:`)

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  exclude: [
    'node_modules/',
    'src/test/',
    '**/*.d.ts',
    'src/components/ui/',
    'src/api/generated/',
    'src/main.tsx',
  ],
  thresholds: {
    lines: 90,
    branches: 100,
    functions: 90,
    statements: 90,
  },
},
```

### `package.json` npm Scripts

```json
{
  "scripts": {
    "test:run":      "vitest run",
    "test:coverage": "vitest run --coverage",
    "check":         "tsc --noEmit && eslint . --max-warnings 0 && npm run test:coverage"
  }
}
```

### Task-Semantik

| Befehl | Wirkung |
|--------|---------|
| `npm run test:run` | Tests ohne Coverage-Gate (TDD-Zyklus) |
| `npm run test:coverage` | Tests + Coverage-Verifikation; schlägt fehl bei Unterschreitung |
| `npm run check` | Type-Check + Lint + Coverage-Verifikation; vollständiger Pflicht-Gate |

---

## Section 3: Playwright E2E

### Architektur

- **Laufzeitumgebung:** Vite Dev Server (Port 8080)
- **API-Mocks in Playwright:** `page.route()` direkt im Test — kein MSW-Browser-Service-Worker nötig. Vitest nutzt MSW im Node-Modus (`setupServer`); Playwright interceptet Netzwerkaufrufe über die Playwright-eigene API. Die Response-Shapes sind in beiden Fällen durch das OpenAPI-Schema konsistent, aber die Handler sind nicht dieselbe Datei.
- **Browser:** Chromium (Desktop) — kein Multi-Browser im Scaffold; weitere Browser werden Feature-spezifisch hinzugefügt
- **Retries in CI:** 2 (Playwright-Standard für flaky-Resilienz)
- **Traces:** `on-first-retry` — nur bei Fehlern gespeichert, kein Storage-Overhead im Normalfall

### Neue Dateien

**`frontend/playwright.config.ts`:**
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
```

**`frontend/e2e/health.spec.ts`** (erster Smoke-Test, mit `page.route()` API-Mock):
```typescript
import { test, expect } from '@playwright/test'

test('zeigt Systemstatus auf der Startseite', async ({ page }) => {
  await page.route('/api/health', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'UP', timestamp: '2026-07-21T10:00:00Z', version: 'e2e' }),
    }),
  )
  await page.goto('/')
  await expect(page.getByText('FamilyHub')).toBeVisible()
  await expect(page.getByText('System bereit')).toBeVisible()
})
```

### npm Scripts

```json
{
  "scripts": {
    "test:e2e":    "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### devDependencies Ergänzung

```json
"@playwright/test": "^1.49.0"
```

### `.gitignore` Ergänzung

```
frontend/playwright-report/
frontend/test-results/
```

---

## Section 4: Pre-Commit Hook + CI

### Pre-Commit Hook

**`scripts/pre-commit-check.sh`:**
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "▶ Backend: Tests + Coverage-Verifikation"
cd "$(git rev-parse --show-toplevel)/backend"
./gradlew check --daemon
cd ..

echo "▶ Frontend: Type-Check + Lint + Coverage"
cd "$(git rev-parse --show-toplevel)/frontend"
npm run check
cd ..

echo "✓ Alle Prüfungen bestanden — Commit wird fortgesetzt"
```

**Installation (einmalig, in `README.md` dokumentiert):**
```bash
cp scripts/pre-commit-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Warum kein Husky:** Kein extra Tooling. Ein `cp`-Befehl. Das Skript ist versioniert im Repository; der Hook ist es nicht (`.git/` wird nicht committed).

### CI — `ci.yml` Änderungen

**`build-backend`:** `./gradlew test` → `./gradlew check`

**`build-frontend`:** Bestehender `npm run test:run`-Schritt ersetzt durch `npm run test:coverage`.

**Neuer Job `e2e` (parallel zu `build-backend` und `build-frontend`, nach `validate-spec`):**

```yaml
e2e:
  name: Frontend — Playwright E2E
  runs-on: ubuntu-latest
  needs: validate-spec
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: npm
        cache-dependency-path: frontend/package-lock.json
    - name: Install dependencies
      run: cd frontend && npm ci
    - name: Install Playwright browsers
      run: cd frontend && npx playwright install --with-deps chromium
    - name: Generate API client
      run: cd frontend && npm run generate:api
    - name: Run Playwright E2E tests
      run: cd frontend && npm run test:e2e
    - name: Upload Playwright report
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: frontend/playwright-report/
        retention-days: 7
```

### CI Job-Übersicht (final)

```
validate-spec ──┬── build-backend   (./gradlew check → GHCR push)
                ├── build-frontend  (npm run check → GHCR push)
                └── e2e             (Playwright gegen Vite Dev Server)
```

---

## Neue Dateien / Änderungen im Überblick

| Datei | Art | Beschreibt |
|-------|-----|-----------|
| `backend/build.gradle.kts` | Änderung | JaCoCo Report + Verification mit Exclusions; `check` dependsOn Verification |
| `frontend/vite.config.ts` | Änderung | Coverage thresholds + Exclusions |
| `frontend/package.json` | Änderung | `test:coverage`, `check`, `test:e2e`, `test:e2e:ui` Scripts; `@playwright/test` devDependency |
| `frontend/playwright.config.ts` | Neu | Playwright-Konfiguration mit webServer |
| `frontend/e2e/health.spec.ts` | Neu | Erster Smoke-Test mit `page.route()` Mock |
| `frontend/src/test/mocks/handlers.ts` | Neu | MSW-Handler für Vitest (Node-Modus) |
| `scripts/pre-commit-check.sh` | Neu | Pre-Commit Gate: Backend check + Frontend check |
| `.github/workflows/ci.yml` | Änderung | `check` statt `test`; neuer `e2e` Job |
| `.gitignore` | Änderung | `playwright-report/`, `test-results/` |
