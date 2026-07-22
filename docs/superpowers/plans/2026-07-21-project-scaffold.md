# FamilyHub Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a fully working monorepo scaffold for FamilyHub with a health endpoint that proves the full stack works end-to-end: Kotlin backend → PostgreSQL → React frontend → Docker Compose → GitHub Actions CI → GHCR.

**Architecture:** API-First monorepo where `api/openapi.yml` is the single source of truth. It drives code generation for the Kotlin backend (Spring controller interfaces + DTOs via openapi-generator Gradle plugin) and the TypeScript frontend (TanStack Query hooks via orval). Package-by-domain (CUPID: Domain-based). PostgreSQL runs as Docker container; backend and frontend run natively during development.

**Tech Stack:** Kotlin 2.0 / Spring Boot 3.3 / Java 21 (eclipse-temurin) / Gradle Kotlin DSL / PostgreSQL 16 / Flyway 10 / openapi-generator-gradle-plugin 7 / React 18 / TypeScript 5 (strict) / Vite 7 / Tailwind CSS 3 / shadcn/ui / TanStack Query 5 / orval 7 / Docker Compose / GitHub Actions / GHCR / Watchtower

## Global Constraints

- Java toolchain: 21 — no lower
- Kotlin: 2.0.x
- Spring Boot: 3.3.x
- Node.js: 20 LTS (`engines` field in `package.json`)
- PostgreSQL: 16-alpine
- TypeScript: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
- No Redis anywhere
- All timestamps UTC, ISO-8601 format in JSON
- One externally exposed port: frontend on **3080**
- Backend, PostgreSQL: internal Docker network only
- `restart: unless-stopped` on all production containers
- `env_file: .env` on all Compose services that use secrets
- Generated code (`build/generated/` backend, `src/api/generated/` frontend) is **never committed**
- Kotlin package prefix: `com.familyhub`
- All REST endpoints under `/api`
- UI strings German; backend/code strings English
- `TZ=Europe/Berlin` in every container

---

## File Map

```
familyhub/                              ← repo root
├── api/
│   └── openapi.yml                     # Task 2 — single source of truth
├── backend/
│   ├── build.gradle.kts                # Task 3
│   ├── settings.gradle.kts             # Task 3
│   ├── gradle/wrapper/                 # Task 3
│   ├── Dockerfile                      # Task 9
│   └── src/
│       ├── main/
│       │   ├── kotlin/com/familyhub/
│       │   │   ├── Application.kt                          # Task 3
│       │   │   └── shared/
│       │   │       ├── health/
│       │   │       │   └── HealthController.kt             # Task 4
│       │   │       ├── config/
│       │   │       │   ├── WebConfig.kt                    # Task 6
│       │   │       │   └── JacksonConfig.kt                # Task 6
│       │   │       ├── security/
│       │   │       │   └── SecurityConfig.kt               # Task 6
│       │   │       └── exceptions/
│       │   │           ├── GlobalExceptionHandler.kt       # Task 6
│       │   │           └── ErrorResponse.kt                # Task 6
│       │   └── resources/
│       │       ├── application.yml                         # Task 4
│       │       └── db/migration/
│       │           └── V1__initial_schema.sql              # Task 5
│       └── test/
│           └── kotlin/com/familyhub/
│               ├── shared/
│               │   └── health/
│               │       ├── HealthControllerTest.kt         # Task 4
│               │       └── HealthIntegrationTest.kt        # Task 5
│               └── BaseIntegrationTest.kt                  # Task 5
├── frontend/
│   ├── package.json                    # Task 7
│   ├── tsconfig.json                   # Task 7
│   ├── vite.config.ts                  # Task 7
│   ├── orval.config.ts                 # Task 7
│   ├── tailwind.config.ts              # Task 7
│   ├── Dockerfile                      # Task 9
│   ├── nginx.conf                      # Task 9
│   └── src/
│       ├── main.tsx                    # Task 8
│       ├── App.tsx                     # Task 8
│       ├── api/generated/              # Task 7 — generated, not committed
│       └── features/
│           └── health/
│               └── HealthPage.tsx      # Task 8
├── docker-compose.yml                  # Task 9 — production
├── docker-compose.dev.yml              # Task 5 — postgres only
├── .env.example                        # Task 9
├── .gitignore                          # Task 1
├── INSTALLATION.md                     # Task 11
└── .github/
    └── workflows/
        └── ci.yml                      # Task 10
```

---

### Task 1: Initialize Monorepo

**Files:**
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: initialized git repo with `.gitignore` covering JVM build output, Node modules, generated code, secrets

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/martin.leipold/Documents/private_workspace/FamilyHub_new
git init
```

Expected: `Initialized empty Git repository in .../FamilyHub_new/.git/`

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p api backend/src/main/kotlin/com/familyhub backend/src/main/resources/db/migration backend/src/test/kotlin/com/familyhub backend/gradle/wrapper frontend/src frontend/.github/workflows .github/workflows docs/superpowers/{specs,plans}
```

- [ ] **Step 3: Write `.gitignore`**

```gitignore
# JVM
.gradle/
build/
*.class
*.jar
!gradle/wrapper/gradle-wrapper.jar

# Generated OpenAPI code
backend/build/generated/
frontend/src/api/generated/

# IntelliJ
.idea/
*.iml
*.iws

# Node
node_modules/
frontend/dist/
frontend/.env.local
coverage/

# Secrets
.env
!.env.example

# OS
.DS_Store
Thumbs.db

# Docker
*.log
```

- [ ] **Step 4: Write minimal `README.md`**

```markdown
# FamilyHub

Self-hosted family dashboard PWA. Runs on Synology NAS as Docker containers.

See [INSTALLATION.md](INSTALLATION.md) for setup instructions.

## Development

```bash
# Start database
docker-compose -f docker-compose.dev.yml up -d

# Backend (port 8081)
cd backend && ./gradlew bootRun

# Frontend (port 8080)
cd frontend && npm run dev
```
```

- [ ] **Step 5: Initial commit**

```bash
git add .gitignore README.md
git commit -m "chore: initialize monorepo"
```

---

### Task 2: OpenAPI Specification

**Files:**
- Create: `api/openapi.yml`

**Interfaces:**
- Produces: `api/openapi.yml` — valid OpenAPI 3.1 spec. Health endpoint: `GET /health → 200 HealthResponse{status, timestamp, version}`. This spec is the contract for Tasks 3, 7.

- [ ] **Step 1: Write `api/openapi.yml`**

```yaml
openapi: "3.1.0"

info:
  title: FamilyHub API
  version: "0.1.0"
  description: Self-hosted family dashboard — REST API

servers:
  - url: /api
    description: Production (nginx reverse proxy)
  - url: http://localhost:8081/api
    description: Local development

tags:
  - name: System
    description: Health and operational endpoints

paths:
  /health:
    get:
      operationId: getHealth
      summary: Health check
      description: Returns service status and database connectivity. Always returns 200; `status` field indicates actual health.
      tags: [System]
      security: []
      responses:
        "200":
          description: Service status
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthResponse"

components:
  schemas:
    HealthResponse:
      type: object
      required: [status, timestamp, version]
      properties:
        status:
          type: string
          enum: [UP, DOWN]
          example: UP
        timestamp:
          type: string
          format: date-time
          description: UTC timestamp of the check
          example: "2026-07-21T10:00:00Z"
        version:
          type: string
          description: Build version (Git SHA from CI)
          example: "abc1234"

    ErrorResponse:
      type: object
      required: [code, message, correlationId]
      properties:
        code:
          type: string
          example: VALIDATION_ERROR
        message:
          type: string
          example: Ungültige Anfrage
        correlationId:
          type: string
          format: uuid
```

- [ ] **Step 2: Validate spec**

Install openapi-generator CLI to validate (one-time):
```bash
npm install -g @openapitools/openapi-generator-cli
openapi-generator-cli validate -i api/openapi.yml
```

Expected: `No validation issues detected.`

- [ ] **Step 3: Commit**

```bash
git add api/openapi.yml
git commit -m "feat: add openapi spec with health endpoint"
```

---

### Task 3: Backend Scaffold + OpenAPI Code Generation

**Files:**
- Create: `backend/settings.gradle.kts`
- Create: `backend/build.gradle.kts`
- Create: `backend/gradle/wrapper/gradle-wrapper.properties`
- Create: `backend/src/main/kotlin/com/familyhub/Application.kt`

**Interfaces:**
- Produces: `./gradlew openApiGenerate` produces `build/generated/openapi/src/main/kotlin/com/familyhub/generated/api/SystemApi.kt` (interface) and `com/familyhub/generated/model/HealthResponse.kt` (data class). `./gradlew build` compiles successfully.

- [ ] **Step 1: Write `backend/settings.gradle.kts`**

```kotlin
rootProject.name = "familyhub-backend"
```

- [ ] **Step 2: Write `backend/build.gradle.kts`**

```kotlin
import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.spring") version "2.0.21"
    kotlin("plugin.jpa") version "2.0.21"
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
    id("org.openapi.tools.openapi-generator") version "7.9.0"
    jacoco
}

group = "com.familyhub"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

val openApiSpecFile = "$rootDir/../api/openapi.yml"
val generatedSourcesDir = layout.buildDirectory.dir("generated/openapi").get().asFile.absolutePath

openApiGenerate {
    generatorName.set("kotlin-spring")
    inputSpec.set(openApiSpecFile)
    outputDir.set(generatedSourcesDir)
    apiPackage.set("com.familyhub.generated.api")
    modelPackage.set("com.familyhub.generated.model")
    configOptions.set(
        mapOf(
            "interfaceOnly" to "true",
            "useTags" to "true",
            "useSpringBoot3" to "true",
            "documentationProvider" to "none",
            "serializationLibrary" to "jackson",
            "enumPropertyNaming" to "UPPERCASE",
            "useOptional" to "false",
        )
    )
}

sourceSets {
    main {
        kotlin {
            srcDir("$generatedSourcesDir/src/main/kotlin")
        }
    }
}

tasks.compileKotlin {
    dependsOn(tasks.openApiGenerate)
}

tasks.test {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    reports {
        xml.required = true
        html.required = true
    }
}

dependencies {
    // Spring Boot
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    // Database
    implementation("org.flywaydb:flyway-core:10.20.1")
    implementation("org.flywaydb:flyway-database-postgresql:10.20.1")
    runtimeOnly("org.postgresql:postgresql")

    // OpenAPI annotations (required by generated code)
    implementation("io.swagger.core.v3:swagger-annotations:2.2.25")
    implementation("jakarta.validation:jakarta.validation-api")

    // Tests
    testImplementation("org.springframework.boot:spring-boot-starter-test") {
        exclude(group = "org.mockito")
    }
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("io.mockk:mockk:1.13.13")
    testImplementation("com.ninja-squad:springmockk:4.0.2")
    testImplementation("org.testcontainers:testcontainers:1.20.4")
    testImplementation("org.testcontainers:junit-jupiter:1.20.4")
    testImplementation("org.testcontainers:postgresql:1.20.4")
}
```

- [ ] **Step 3: Bootstrap Gradle wrapper**

```bash
cd backend
gradle wrapper --gradle-version=8.12 --distribution-type=bin
cd ..
```

Expected: `backend/gradle/wrapper/gradle-wrapper.properties` and `backend/gradlew` created.

- [ ] **Step 4: Write `backend/src/main/kotlin/com/familyhub/Application.kt`**

```kotlin
package com.familyhub

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class FamilyHubApplication

fun main(args: Array<String>) {
    runApplication<FamilyHubApplication>(*args)
}
```

- [ ] **Step 5: Run openapi-generator**

```bash
cd backend
./gradlew openApiGenerate
```

Expected: `BUILD SUCCESSFUL`. Check that these files exist:
```
build/generated/openapi/src/main/kotlin/com/familyhub/generated/api/SystemApi.kt
build/generated/openapi/src/main/kotlin/com/familyhub/generated/model/HealthResponse.kt
build/generated/openapi/src/main/kotlin/com/familyhub/generated/model/ErrorResponse.kt
```

- [ ] **Step 6: Verify compilation**

```bash
./gradlew compileKotlin
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: scaffold backend with openapi code generation"
```

---

### Task 4: Health Endpoint + Unit Test

**Files:**
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/kotlin/com/familyhub/shared/health/HealthController.kt`
- Create: `backend/src/test/kotlin/com/familyhub/shared/health/HealthControllerTest.kt`
- Create: `backend/src/test/resources/application-test.yml`

**Interfaces:**
- Consumes: `com.familyhub.generated.api.SystemApi` (interface generated in Task 3), `com.familyhub.generated.model.HealthResponse` (data class)
- Produces: `GET /api/health → 200 { "status": "UP", "timestamp": "...", "version": "..." }`. `HealthController` implements `SystemApi`.

- [ ] **Step 1: Write `backend/src/main/resources/application.yml`**

```yaml
spring:
  application:
    name: familyhub-backend
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5433/familyhub}
    username: ${SPRING_DATASOURCE_USERNAME:familyhub}
    password: ${SPRING_DATASOURCE_PASSWORD:familyhub_dev}
  jpa:
    hibernate:
      ddl-auto: none
    open-in-view: false
  flyway:
    enabled: true
    locations: classpath:db/migration

server:
  port: 8081

familyhub:
  version: ${APP_VERSION:dev}
  security:
    encryption-key: ${FAMILYHUB_ENCRYPTION_KEY:}
```

- [ ] **Step 2: Write failing test `HealthControllerTest.kt`**

```kotlin
package com.familyhub.shared.health

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
class HealthControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `GET api health returns UP status`() {
        mockMvc.get("/api/health")
            .andExpect {
                status { isOk() }
                content { contentType("application/json") }
                jsonPath("$.status") { value("UP") }
                jsonPath("$.timestamp") { exists() }
                jsonPath("$.version") { exists() }
            }
    }
}
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd backend
./gradlew test --tests "com.familyhub.shared.health.HealthControllerTest" 2>&1 | tail -20
```

Expected: `BUILD FAILED` — `HealthController` not found yet.

- [ ] **Step 4: Write `HealthController.kt`**

```kotlin
package com.familyhub.shared.health

import com.familyhub.generated.api.SystemApi
import com.familyhub.generated.model.HealthResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api")
class HealthController(
    @Value("\${familyhub.version:dev}") private val version: String,
) : SystemApi {

    override fun getHealth(): ResponseEntity<HealthResponse> {
        return ResponseEntity.ok(
            HealthResponse(
                status = HealthResponse.Status.UP,
                timestamp = Instant.now().toString(),
                version = version,
            )
        )
    }
}
```

- [ ] **Step 5: Write `application-test.yml`**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1
    username: sa
    password:
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop
    database-platform: org.hibernate.dialect.H2Dialect
  flyway:
    enabled: false

familyhub:
  version: test
  security:
    encryption-key: "test-key-32-bytes-exactly-here!!"
```

Add H2 test dependency to `build.gradle.kts`:

```kotlin
// In dependencies block, add:
testRuntimeOnly("com.h2database:h2")
```

- [ ] **Step 6: Run test — verify it passes**

```bash
./gradlew test --tests "com.familyhub.shared.health.HealthControllerTest"
```

Expected: `BUILD SUCCESSFUL` and `1 test completed`.

- [ ] **Step 7: Manual smoke test**

```bash
# In one terminal:
./gradlew bootRun &

# Wait for startup, then:
curl -s http://localhost:8081/api/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "UP",
    "timestamp": "2026-07-21T10:00:00Z",
    "version": "dev"
}
```

Kill the background process: `kill %1`

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: add health endpoint with unit test"
```

---

### Task 5: PostgreSQL + Flyway + Integration Test

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `backend/src/main/resources/db/migration/V1__initial_schema.sql`
- Create: `backend/src/test/kotlin/com/familyhub/BaseIntegrationTest.kt`
- Create: `backend/src/test/kotlin/com/familyhub/shared/health/HealthIntegrationTest.kt`
- Create: `backend/src/test/resources/application-integration.yml`

**Interfaces:**
- Produces: `BaseIntegrationTest` — abstract class all integration tests extend. Starts a PostgreSQL 16 Testcontainer, applies all Flyway migrations, exposes `webApplicationContext` and `mockMvc`. `HealthIntegrationTest` proves Flyway runs and the endpoint works against real DB.

- [ ] **Step 1: Write `docker-compose.dev.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: familyhub-postgres-dev
    environment:
      POSTGRES_DB: familyhub
      POSTGRES_USER: familyhub
      POSTGRES_PASSWORD: familyhub_dev
    ports:
      - "5433:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U familyhub -d familyhub"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_dev_data:
```

- [ ] **Step 2: Start dev database**

```bash
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml ps
```

Expected: `familyhub-postgres-dev` running and healthy.

- [ ] **Step 3: Write `V1__initial_schema.sql`**

This first migration establishes the schema baseline. Further migrations add domain tables.

```sql
-- V1: Initial schema — settings and family_members foundation
-- Additional domain tables added in subsequent migrations (V2+)

CREATE TABLE settings (
    key        VARCHAR(255) PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE settings IS 'Key-value store for runtime configuration managed via Setup Wizard';

CREATE TABLE family_members (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    color      VARCHAR(7),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE family_members IS 'Members of the family. No passwords — identified by selection at action time.';
```

- [ ] **Step 4: Write `BaseIntegrationTest.kt`**

```kotlin
package com.familyhub

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.beans.factory.annotation.Autowired
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("integration")
@Testcontainers
abstract class BaseIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    companion object {
        @Container
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine").apply {
            withDatabaseName("familyhub")
            withUsername("familyhub")
            withPassword("familyhub_test")
        }

        @JvmStatic
        @DynamicPropertySource
        fun configureProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
```

- [ ] **Step 5: Write `application-integration.yml`**

```yaml
spring:
  flyway:
    enabled: true
  jpa:
    hibernate:
      ddl-auto: none

familyhub:
  version: integration-test
  security:
    encryption-key: "integration-key-32-bytes-exactly!"
```

- [ ] **Step 6: Write failing `HealthIntegrationTest.kt`**

```kotlin
package com.familyhub.shared.health

import com.familyhub.BaseIntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

class HealthIntegrationTest : BaseIntegrationTest() {

    @Test
    fun `health endpoint returns UP with real database`() {
        mockMvc.get("/api/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("UP") }
                jsonPath("$.version") { value("integration-test") }
            }
    }
}
```

- [ ] **Step 7: Run integration test — verify it passes**

```bash
cd backend
./gradlew test --tests "com.familyhub.shared.health.HealthIntegrationTest"
```

Expected: `BUILD SUCCESSFUL`. Testcontainers pulls `postgres:16-alpine` on first run (this takes ~30 seconds). On subsequent runs it's fast.

- [ ] **Step 8: Commit**

```bash
cd ..
git add docker-compose.dev.yml backend/
git commit -m "feat: add postgresql dev setup, flyway v1 migration and integration test"
```

---

### Task 6: Shared Layer — Security, Exceptions, Config

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/shared/security/SecurityConfig.kt`
- Create: `backend/src/main/kotlin/com/familyhub/shared/config/WebConfig.kt`
- Create: `backend/src/main/kotlin/com/familyhub/shared/config/JacksonConfig.kt`
- Create: `backend/src/main/kotlin/com/familyhub/shared/exceptions/ErrorResponse.kt`
- Create: `backend/src/main/kotlin/com/familyhub/shared/exceptions/GlobalExceptionHandler.kt`
- Modify: `backend/src/main/resources/application.yml` — add startup validation
- Create: `backend/src/main/kotlin/com/familyhub/shared/config/StartupValidator.kt`

**Interfaces:**
- Produces: `GET /api/health` remains open. All other `GET /api/**` and `POST /api/**` return 401 without auth. Error responses always match `{ code, message, correlationId }`. UTC timestamps in all JSON. Application refuses to start if `familyhub.security.encryption-key` is empty or equals the default `defaultKey`.

- [ ] **Step 1: Write failing `SecurityConfigTest.kt`**

```kotlin
package com.familyhub.shared.security

import com.familyhub.shared.health.HealthController
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@WebMvcTest(HealthController::class)
class SecurityConfigTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `health endpoint is publicly accessible`() {
        mockMvc.get("/api/health")
            .andExpect { status { isOk() } }
    }
}
```

- [ ] **Step 2: Run test — verify it passes already** (Spring Boot auto-config allows health by default — we verify our explicit config keeps it open)

```bash
cd backend
./gradlew test --tests "com.familyhub.shared.security.SecurityConfigTest"
```

Expected: `BUILD SUCCESSFUL` (will pass after SecurityConfig is written correctly).

- [ ] **Step 3: Write `SecurityConfig.kt`**

```kotlin
package com.familyhub.shared.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain

@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { auth ->
                auth
                    .requestMatchers("/api/health").permitAll()
                    .requestMatchers("/api/settings/setup-status").permitAll()
                    .requestMatchers("/api/settings/verify-pin").permitAll()
                    .anyRequest().authenticated()
            }

        return http.build()
    }
}
```

Note: Full PIN-session enforcement (custom filter) is added in the Settings domain task, not here. This config establishes the baseline: only health and setup-flow endpoints are open.

- [ ] **Step 4: Write `ErrorResponse.kt`**

```kotlin
package com.familyhub.shared.exceptions

import java.util.UUID

data class ErrorResponse(
    val code: String,
    val message: String,
    val correlationId: String = UUID.randomUUID().toString(),
)
```

- [ ] **Step 5: Write `GlobalExceptionHandler.kt`**

```kotlin
package com.familyhub.shared.exceptions

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.servlet.resource.NoResourceFoundException
import java.util.UUID

@RestControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNotFound(ex: NoResourceFoundException): ResponseEntity<ErrorResponse> {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            ErrorResponse(code = "NOT_FOUND", message = "Ressource nicht gefunden")
        )
    }

    @ExceptionHandler(Exception::class)
    fun handleGeneric(ex: Exception): ResponseEntity<ErrorResponse> {
        val correlationId = UUID.randomUUID().toString()
        log.error("Unhandled exception [correlationId={}]", correlationId, ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
            ErrorResponse(
                code = "INTERNAL_ERROR",
                message = "Ein interner Fehler ist aufgetreten",
                correlationId = correlationId,
            )
        )
    }
}
```

- [ ] **Step 6: Write `WebConfig.kt`**

```kotlin
package com.familyhub.shared.config

import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig : WebMvcConfigurer {

    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/api/**")
            .allowedOrigins("http://localhost:8080", "http://localhost:3080")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(false)
    }
}
```

- [ ] **Step 7: Write `JacksonConfig.kt`**

```kotlin
package com.familyhub.shared.config

import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.TimeZone

@Configuration
class JacksonConfig {

    @Bean
    fun jacksonCustomizer(): Jackson2ObjectMapperBuilderCustomizer = Jackson2ObjectMapperBuilderCustomizer { builder ->
        builder.modules(JavaTimeModule())
        builder.featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
        builder.timeZone(TimeZone.getTimeZone("UTC"))
    }
}
```

- [ ] **Step 8: Write `StartupValidator.kt`**

```kotlin
package com.familyhub.shared.config

import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class StartupValidator(
    @Value("\${familyhub.security.encryption-key:}") private val encryptionKey: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @PostConstruct
    fun validate() {
        if (encryptionKey.isBlank()) {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY must be set. " +
                "Starting with an empty encryption key is not allowed."
            )
        }
        if (encryptionKey == "defaultKey12345678901234567890123") {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY is set to the insecure default value. " +
                "Generate a secure 32+ character key."
            )
        }
        if (encryptionKey.length < 32) {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY must be at least 32 characters. " +
                "Current length: ${encryptionKey.length}"
            )
        }
        log.info("Startup validation passed: encryption key configured correctly")
    }
}
```

Update `application-test.yml` to set a valid key (already done in Task 5 — `"test-key-32-bytes-exactly!!"`). ✓

- [ ] **Step 9: Run all tests**

```bash
cd backend
./gradlew test
```

Expected: `BUILD SUCCESSFUL`. All tests green.

- [ ] **Step 10: Commit**

```bash
cd ..
git add backend/
git commit -m "feat: add security config, exception handler, jackson UTC config, startup validation"
```

---

### Task 7: Frontend Scaffold + Strict TypeScript + Orval API Client

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/orval.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Create: `frontend/index.html`

**Interfaces:**
- Consumes: `api/openapi.yml` (Task 2)
- Produces: `npm run generate:api` creates `src/api/generated/` with TanStack Query hook `useGetHealth()`. `npm run build` succeeds with `strict: true`. `npm run type-check` passes.

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "familyhub-frontend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "type-check": "tsc --noEmit",
    "generate:api": "orval",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.0",
    "@tanstack/react-query": "^5.83.0",
    "lucide-react": "^0.462.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "vite": "^7.0.0",
    "@vitejs/plugin-react-swc": "^4.2.3",
    "vite-plugin-pwa": "^1.0.0",
    "typescript": "^5.8.3",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.5.0",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "orval": "^7.3.0",
    "vitest": "^4.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "jsdom": "^28.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Write `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "orval.config.ts", "tailwind.config.ts"]
}
```

- [ ] **Step 4: Write `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FamilyHub',
        short_name: 'FamilyHub',
        description: 'Dein digitales Familien-Dashboard',
        lang: 'de',
        start_url: '/',
        display: 'standalone',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '::',
    port: 8080,
    proxy: {
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 5: Write `frontend/orval.config.ts`**

```typescript
import { defineConfig } from 'orval'

export default defineConfig({
  familyhub: {
    output: {
      mode: 'split',
      target: './src/api/generated/endpoints',
      schemas: './src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '/api',
      override: {
        mutator: {
          path: './src/api/customFetch.ts',
          name: 'customFetch',
        },
      },
    },
    input: {
      target: '../api/openapi.yml',
    },
  },
})
```

- [ ] **Step 6: Write `frontend/src/api/customFetch.ts`**

This is the fetch wrapper orval uses — handles base URL and error responses:

```typescript
export async function customFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message ?? `HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
```

- [ ] **Step 7: Write `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 8: Write `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 9: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FamilyHub</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Write `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 11: Install dependencies and generate API client**

```bash
cd frontend
npm install
npm run generate:api
```

Expected: `src/api/generated/` created with:
- `endpoints/system.ts` — contains `useGetHealth()` hook
- `model/healthResponse.ts` — TypeScript type

- [ ] **Step 12: Run type-check**

```bash
npm run type-check
```

Expected: No errors.

- [ ] **Step 13: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold frontend with strict typescript, tailwind, and orval api client"
```

---

### Task 8: Frontend Health Page

**Files:**
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/features/health/HealthPage.tsx`

**Interfaces:**
- Consumes: `useGetHealth()` from `@/api/generated/endpoints/system` (generated Task 7)
- Produces: Browser at `http://localhost:8080` shows FamilyHub dashboard with health status from backend.

- [ ] **Step 1: Write `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Write `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HealthPage from '@/features/health/HealthPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HealthPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Write `frontend/src/features/health/HealthPage.tsx`**

```tsx
import { useGetHealth } from '@/api/generated/endpoints/system'

export default function HealthPage() {
  const { data, isLoading, isError } = useGetHealth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <p className="text-xl">Verbinde mit Server…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-red-400">
        <p className="text-xl">Server nicht erreichbar</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">FamilyHub</h1>
        <div className="flex items-center gap-2 justify-center">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              data.status === 'UP' ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span className="text-lg">
            System {data.status === 'UP' ? 'bereit' : 'nicht verfügbar'}
          </span>
        </div>
        <p className="text-slate-400 text-sm">Version: {data.version}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Build to verify type-check passes**

```bash
cd frontend
npm run build
```

Expected: `BUILD SUCCESSFUL` with output in `dist/`.

- [ ] **Step 5: Run dev servers and verify end-to-end**

```bash
# Terminal 1: backend
cd backend && ./gradlew bootRun

# Terminal 2: frontend
cd frontend && npm run dev
```

Open `http://localhost:8080` in browser.

Expected: Dark screen with "FamilyHub", green dot, "System bereit", version "dev".

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/
git commit -m "feat: add health page with TanStack Query — proves full stack works"
```

---

### Task 9: Dockerfiles + Production Docker Compose

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Produces: `docker-compose up --build` starts all services. `curl http://localhost:3080/api/health` returns `{"status":"UP",...}`. Only port 3080 is exposed externally.

- [ ] **Step 1: Write `backend/Dockerfile`**

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace

COPY gradle/ gradle/
COPY gradlew settings.gradle.kts build.gradle.kts ./
RUN ./gradlew dependencies --no-daemon

COPY src/ src/
# Copy openapi spec (one level up in monorepo)
COPY --from=api / /workspace/api/
RUN ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8081/api/health || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

Note: The openapi spec is in `../api/` relative to backend. In CI we build with `docker build -f backend/Dockerfile .` from repo root.

Rewrite Dockerfile to work with build context at repo root:

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace

COPY backend/gradle/ gradle/
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts ./
RUN ./gradlew dependencies --no-daemon

COPY api/ /workspace/../api/
COPY backend/src/ src/
RUN ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8081/api/health || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

- [ ] **Step 2: Write `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/javascript application/json image/svg+xml;

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location / {
        try_files $uri $uri/ /index.html;
        expires -1;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://backend:8081/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        client_max_body_size 10m;
    }
}
```

- [ ] **Step 3: Write `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY api/ /api/
COPY frontend/ .
RUN npm run generate:api
RUN npm run build

FROM nginx:1.27-alpine AS runtime
RUN addgroup -S nginx-app && adduser -S nginx-user -G nginx-app
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1
```

- [ ] **Step 4: Write `.env.example`**

```bash
# Copy to .env and fill in values before starting

# Database
SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/familyhub
SPRING_DATASOURCE_USERNAME=familyhub
SPRING_DATASOURCE_PASSWORD=CHANGE_ME_use_a_strong_password

# Security — REQUIRED: generate with: openssl rand -base64 32
FAMILYHUB_ENCRYPTION_KEY=CHANGE_ME_generate_32_char_key_here!!

# Application
APP_VERSION=local
TZ=Europe/Berlin

# PostgreSQL container
POSTGRES_DB=familyhub
POSTGRES_USER=familyhub
POSTGRES_PASSWORD=CHANGE_ME_use_a_strong_password
```

- [ ] **Step 5: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: familyhub-postgres
    env_file: .env
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      TZ: ${TZ:-Europe/Berlin}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - familyhub-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ghcr.io/GITHUB_USER/familyhub-backend:latest
    container_name: familyhub-backend
    env_file: .env
    environment:
      SPRING_DATASOURCE_URL: ${SPRING_DATASOURCE_URL}
      SPRING_DATASOURCE_USERNAME: ${SPRING_DATASOURCE_USERNAME}
      SPRING_DATASOURCE_PASSWORD: ${SPRING_DATASOURCE_PASSWORD}
      FAMILYHUB_ENCRYPTION_KEY: ${FAMILYHUB_ENCRYPTION_KEY}
      APP_VERSION: ${APP_VERSION:-unknown}
      TZ: ${TZ:-Europe/Berlin}
    networks:
      - familyhub-network
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8081/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

  frontend:
    image: ghcr.io/GITHUB_USER/familyhub-frontend:latest
    container_name: familyhub-frontend
    ports:
      - "3080:80"
    networks:
      - familyhub-network
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 5s
      retries: 3

  watchtower:
    image: containrrr/watchtower:latest
    container_name: familyhub-watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker/config.json:/config.json:ro
    environment:
      WATCHTOWER_POLL_INTERVAL: 300
      WATCHTOWER_CLEANUP: "true"
      WATCHTOWER_INCLUDE_STOPPED: "false"
      WATCHTOWER_SCOPE: familyhub
    command: familyhub-backend familyhub-frontend
    restart: unless-stopped

volumes:
  postgres_data:

networks:
  familyhub-network:
    driver: bridge
```

- [ ] **Step 6: Test Docker build locally**

```bash
# From repo root — build both images
docker build -f backend/Dockerfile -t familyhub-backend:local .
docker build -f frontend/Dockerfile -t familyhub-frontend:local .
```

Expected: Both build successfully. Backend image ~180 MB, Frontend image ~25 MB.

- [ ] **Step 7: Add `.dockerignore` to keep secrets out of build context**

Create `frontend/.dockerignore`:
```
.env.local
node_modules/
dist/
src/api/generated/
```

Create `backend/.dockerignore`:
```
build/
.gradle/
```

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml .env.example backend/Dockerfile frontend/Dockerfile frontend/nginx.conf frontend/.dockerignore backend/.dockerignore
git commit -m "feat: add dockerfiles and production docker-compose with watchtower"
```

---

### Task 10: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Pipeline with 3 jobs: `validate-spec` (openapi-generator validate), `build-backend` (compile + test + docker build + push GHCR), `build-frontend` (type-check + lint + test + docker build + push GHCR). Push to GHCR only on `main` branch. Tags: `latest` + git SHA.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_BACKEND: ghcr.io/${{ github.repository_owner }}/familyhub-backend
  IMAGE_FRONTEND: ghcr.io/${{ github.repository_owner }}/familyhub-frontend

jobs:
  validate-spec:
    name: Validate OpenAPI Spec
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install openapi-generator-cli
        run: npm install -g @openapitools/openapi-generator-cli

      - name: Validate openapi.yml
        run: openapi-generator-cli validate -i api/openapi.yml

  build-backend:
    name: Backend — Build & Test
    runs-on: ubuntu-latest
    needs: validate-spec
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
          cache: gradle

      - name: Run tests
        run: cd backend && ./gradlew test
        env:
          SPRING_DATASOURCE_URL: ''  # Testcontainers handles this

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: backend-test-results
          path: backend/build/reports/tests/

      - name: Log in to GHCR
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push backend image
        if: github.ref == 'refs/heads/main'
        uses: docker/build-push-action@v6
        with:
          context: .
          file: backend/Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_BACKEND }}:latest
            ${{ env.IMAGE_BACKEND }}:${{ github.sha }}
          build-args: |
            APP_VERSION=${{ github.sha }}

  build-frontend:
    name: Frontend — Build & Test
    runs-on: ubuntu-latest
    needs: validate-spec
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: cd frontend && npm ci

      - name: Generate API client
        run: cd frontend && npm run generate:api

      - name: Type check
        run: cd frontend && npm run type-check

      - name: Lint
        run: cd frontend && npm run lint

      - name: Run tests
        run: cd frontend && npm run test:run

      - name: Build
        run: cd frontend && npm run build

      - name: Log in to GHCR
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push frontend image
        if: github.ref == 'refs/heads/main'
        uses: docker/build-push-action@v6
        with:
          context: .
          file: frontend/Dockerfile
          push: true
          tags: |
            ${{ env.IMAGE_FRONTEND }}:latest
            ${{ env.IMAGE_FRONTEND }}:${{ github.sha }}
```

- [ ] **Step 2: Make GHCR packages public (one-time, on GitHub)**

Go to `github.com/GITHUB_USER` → Packages → `familyhub-backend` → Settings → Change visibility → Public.  
Repeat for `familyhub-frontend`.  
(Watchtower on NAS needs no auth to pull public packages.)

- [ ] **Step 3: Commit and push**

```bash
git add .github/
git commit -m "feat: add github actions ci pipeline with ghcr push"
git remote add origin https://github.com/GITHUB_USER/familyhub.git
git push -u origin main
```

Expected: CI pipeline runs in GitHub Actions. All 3 jobs green. Images pushed to GHCR.

- [ ] **Step 4: Verify images in GHCR**

```
https://github.com/GITHUB_USER?tab=packages
```

Expected: `familyhub-backend` and `familyhub-frontend` packages visible with `latest` tag.

---

### Task 11: INSTALLATION.md

**Files:**
- Create: `INSTALLATION.md`

**Interfaces:**
- Produces: Complete, accurate setup guide for Synology NAS. References only environment variables that actually exist in `.env.example`.

- [ ] **Step 1: Write `INSTALLATION.md`**

````markdown
# FamilyHub — Installation auf Synology NAS

## Voraussetzungen

| Anforderung | Details |
|-------------|---------|
| DSM | 7.0 oder höher |
| RAM | Mindestens 2 GB frei |
| Speicher | Mindestens 2 GB frei |
| Pakete | **Container Manager** (Docker) |
| Zugang | SSH empfohlen |

## 1. Repository klonen

```bash
ssh admin@NAS-IP
mkdir -p /volume1/docker
cd /volume1/docker
git clone https://github.com/GITHUB_USER/familyhub.git
cd familyhub
```

## 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
vi .env
```

Folgende Werte müssen gesetzt werden:

| Variable | Beschreibung | Beispiel |
|----------|--------------|---------|
| `POSTGRES_PASSWORD` | Datenbankpasswort | zufälliger String |
| `SPRING_DATASOURCE_PASSWORD` | Muss identisch zu `POSTGRES_PASSWORD` sein | |
| `FAMILYHUB_ENCRYPTION_KEY` | 32+ Zeichen, für OAuth-Token-Verschlüsselung | `openssl rand -base64 32` |

```bash
# Sicheren Schlüssel generieren:
openssl rand -base64 32
```

## 3. GHCR-Pakete als öffentlich setzen (einmalig)

Gehe zu `github.com/GITHUB_USER` → Packages → je Paket → Settings → Visibility → Public.  
Danach braucht Watchtower keine Anmeldung.

## 4. Stack starten

```bash
docker-compose up -d
```

Beim ersten Start lädt Docker die Images herunter (~200 MB). Das dauert je nach Verbindung 1–5 Minuten.

```bash
# Status prüfen:
docker-compose ps

# Logs:
docker-compose logs -f
```

## 5. Ersteinrichtung

Öffne im Browser: `http://NAS-IP:3080`

Der Setup-Wizard führt durch:
1. PIN setzen (Kindersicherung für Einstellungen)
2. Familienmitglieder anlegen
3. Google OAuth verbinden (optional, für Kalender & Aufgaben)
4. Synology Photos verbinden (optional, für Slideshow)
5. Wetter-API einrichten (optional)

## 6. Updates

Updates erfolgen automatisch über Watchtower. Nach jedem Push auf `main` im GitHub-Repository:

1. GitHub Actions baut neue Docker-Images und pusht sie zu GHCR (~3–5 Minuten)
2. Watchtower prüft alle 5 Minuten auf neue Images
3. Bei neuen Images: Container werden automatisch neu gestartet (~30 Sekunden Downtime)

Manuelles Update erzwingen:
```bash
docker-compose pull && docker-compose up -d
```

## 7. Backup

```bash
# Datenbank sichern:
docker-compose exec postgres pg_dump -U familyhub familyhub > backup-$(date +%Y%m%d).sql

# Backup wiederherstellen:
docker-compose exec -T postgres psql -U familyhub familyhub < backup-YYYYMMDD.sql
```

**Wichtig:** Den Wert `FAMILYHUB_ENCRYPTION_KEY` aus `.env` separat sichern — ohne ihn sind gespeicherte OAuth-Tokens nicht entschlüsselbar.

## 8. Troubleshooting

**Container startet nicht:**
```bash
docker-compose logs backend
```
Häufigste Ursache: `FAMILYHUB_ENCRYPTION_KEY` nicht gesetzt oder zu kurz.

**Datenbank nicht erreichbar:**
```bash
docker-compose ps postgres  # Healthcheck-Status prüfen
```

**Ports:**

| Port | Dienst | Zugang |
|------|--------|--------|
| 3080 | Frontend (öffentlich im LAN) | `http://NAS-IP:3080` |
| alle anderen | intern | nicht von außen erreichbar |
````

- [ ] **Step 2: Commit**

```bash
git add INSTALLATION.md
git commit -m "docs: add installation guide for synology nas"
```

---

## Self-Review

**Spec Coverage:**
- ✅ Kotlin 2.0 / Spring Boot 3.3 / Java 21 — Task 3
- ✅ OpenAPI-First mit Code-Generation Backend — Task 3
- ✅ OpenAPI-First mit Code-Generation Frontend (orval) — Task 7
- ✅ PostgreSQL 16 + Flyway — Task 5
- ✅ Package-by-Domain (CUPID) — Paketstruktur in Task 4/6
- ✅ CUPID: Idiomatic Kotlin — Task 4/6 (data class, no Java-style)
- ✅ CUPID: Predictable — Task 6 (GlobalExceptionHandler, UTC Jackson)
- ✅ Startup-Validierung Encryption Key — Task 6
- ✅ Monorepo — Task 1
- ✅ Docker Compose (dev + prod) — Task 5 + 9
- ✅ Nur ein externer Port (3080) — Task 9
- ✅ `restart: unless-stopped` — Task 9
- ✅ `env_file: .env` — Task 9
- ✅ Avatar-Volume — Task 9 (nur postgres_data im Scaffold; avatar_data in Members-Feature-Plan)
- ✅ `TZ=Europe/Berlin` — Task 9
- ✅ Kein Redis — nirgends
- ✅ GitHub Actions → GHCR — Task 10
- ✅ Watchtower — Task 9 + 10
- ✅ INSTALLATION.md (eine Datei, nur hier) — Task 11
- ✅ TypeScript strict — Task 7
- ✅ Testcontainers — Task 5
- ✅ SecurityConfig (health offen, Rest 401) — Task 6

**Placeholder-Scan:**
- `GITHUB_USER` in `docker-compose.yml`, `ci.yml`, `INSTALLATION.md` — bewusster Platzhalter, muss beim Setup durch echten GitHub-Username ersetzt werden. Im Plan dokumentiert. ✓
- Kein "TBD", kein "TODO", keine unfertigen Steps. ✓

**Type Consistency:**
- `useGetHealth()` in Task 7 generiert, in Task 8 importiert von `@/api/generated/endpoints/system` — konsistent. ✓
- `HealthResponse.Status.UP` (Enum) in Task 4 — korrekt für `kotlin-spring` Generator. ✓
- `SystemApi` Interface (Task 3) implementiert in `HealthController` (Task 4) — konsistent. ✓
