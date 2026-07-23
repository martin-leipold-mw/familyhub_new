# Schritt 2 — Backend (Members, Settings, PIN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for Stufe 2: family-member CRUD with avatars, settings storage, and PIN protection enforced server-side via an in-memory session interceptor.

**Architecture:** Spring Boot (Kotlin) with JPA entities over Flyway-migrated tables. The OpenAPI spec drives generated Spring interfaces (`kotlin-spring`), which the controllers implement. PIN protection is a `HandlerInterceptor` keyed on a `@RequiresPinSession` annotation; it is a no-op while setup is incomplete (no PIN exists yet) and enforces an in-memory `X-Pin-Session` token afterwards. This is **the sibling of** the frontend plan `2026-07-22-schritt2-frontend.md`, which consumes these endpoints. Build this plan first.

**Tech Stack:** Kotlin 2.0.21, Spring Boot 3.3.5, Java 21, PostgreSQL 16, Flyway 10, JUnit 5, MockK/springmockk, Testcontainers, Jacoco.

## Global Constraints

- **Flyway only** for schema. `spring.jpa.hibernate.ddl-auto = none` — never let Hibernate touch the schema.
- **Migration numbering:** next migrations are `V2` and `V3`; files live in `backend/src/main/resources/db/migration/`.
- **OpenAPI is the single source of truth.** All new endpoints go in `api/openapi.yml`; controllers implement the generated `com.familyhub.generated.api.*Api` interfaces. Generator config already set: `kotlin-spring`, `interfaceOnly=true`, `useTags=true`, `enumPropertyNaming=UPPERCASE`.
- **API base path:** existing system endpoints are `/api/health`; all Stufe-2 endpoints are versioned under `/api/v1/...`. In `openapi.yml` (server url `/api`) that means paths starting `/v1/...`. Controllers implementing generated interfaces add class-level `@RequestMapping("/api")`.
- **PIN:** plaintext storage is acceptable (child-safety lock). The PIN value must **never** be returned by any endpoint. Session enforcement is server-side.
- **PIN session timeout:** exactly **15 minutes** of inactivity, hard-coded (`PinSessionService.TIMEOUT`).
- **Jacoco coverage gate:** 90% line, 100% branch, excluding `**/Application*`, `**/generated/**`, `**/config/**`, `**/security/**`, `**/exceptions/ErrorResponse*`. New packages `com.familyhub.members`, `com.familyhub.settings`, `com.familyhub.pin` **are** covered — write tests for every branch.
- **German** for all user-facing strings (error messages), quoted verbatim.
- **Spec gap resolved:** the design references `PUT setup.step = 2/3` for the wizard but lists no endpoint. This plan adds `POST /api/v1/settings/setup-step` (public, only while `setup.completed = false`) to realize that behavior.
- **Deviation from design table:** protected member endpoints (`POST/PUT/DELETE /members`, `PUT avatar`) are **open while `setup.completed = false`** — a PIN cannot exist yet, so the wizard can create members without a session; protection activates once setup completes. This resolves the design's "Kein PIN-Schutz im Wizard" note.

---

### Task 1: V2 migration + FamilyMember entity + repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__extend_family_members.sql`
- Create: `backend/src/main/kotlin/com/familyhub/members/FamilyMember.kt`
- Create: `backend/src/main/kotlin/com/familyhub/members/FamilyMemberRepository.kt`
- Test: `backend/src/test/kotlin/com/familyhub/members/FamilyMemberRepositoryIntegrationTest.kt`

**Interfaces:**
- Consumes: `BaseIntegrationTest` (Testcontainers Postgres, already present).
- Produces:
  - `FamilyMember` entity — fields `id: UUID?`, `name: String`, `role: String`, `color: String`, `dateOfBirth: LocalDate?`, `isActive: Boolean`, `avatarData: ByteArray?`, `avatarUrl: String?`, `createdAt: Instant?`, `updatedAt: Instant?`. Primary constructor params: `name, role, color, dateOfBirth = null, isActive = true, avatarData = null, avatarUrl = null`.
  - `FamilyMemberRepository : JpaRepository<FamilyMember, UUID>` with `findByIsActiveTrueOrderByCreatedAtAsc(): List<FamilyMember>` and `countByIsActiveTrue(): Long`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/members/FamilyMemberRepositoryIntegrationTest.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class FamilyMemberRepositoryIntegrationTest : BaseIntegrationTest() {

    @Autowired
    lateinit var repository: FamilyMemberRepository

    @Test
    fun `saves and reads a member with all new columns`() {
        val saved = repository.save(
            FamilyMember(name = "Anna", role = "parent", color = "blue")
        )

        val found = repository.findById(saved.id!!).orElseThrow()
        assertThat(found.name).isEqualTo("Anna")
        assertThat(found.role).isEqualTo("parent")
        assertThat(found.color).isEqualTo("blue")
        assertThat(found.isActive).isTrue()
        assertThat(found.avatarData).isNull()
        assertThat(found.createdAt).isNotNull()
        assertThat(found.updatedAt).isNotNull()
    }

    @Test
    fun `findByIsActiveTrue excludes soft-deleted members`() {
        repository.save(FamilyMember(name = "Aktiv", role = "child", color = "pink"))
        repository.save(FamilyMember(name = "Weg", role = "child", color = "green", isActive = false))

        val active = repository.findByIsActiveTrueOrderByCreatedAtAsc()
        assertThat(active).extracting<String> { it.name }.containsExactly("Aktiv")
        assertThat(repository.countByIsActiveTrue()).isEqualTo(1L)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.FamilyMemberRepositoryIntegrationTest"`
Expected: FAIL — compilation error, `FamilyMember` / `FamilyMemberRepository` unresolved.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V2__extend_family_members.sql`:

```sql
-- V2: Extend family_members for Stufe 2 (role, birth date, soft-delete, avatar bytes)

ALTER TABLE family_members ADD COLUMN role          VARCHAR(10) NOT NULL DEFAULT 'child';
ALTER TABLE family_members ADD COLUMN date_of_birth DATE;
ALTER TABLE family_members ADD COLUMN is_active     BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE family_members ADD COLUMN avatar_data   BYTEA;

COMMENT ON COLUMN family_members.role IS 'parent | child';
COMMENT ON COLUMN family_members.is_active IS 'Soft-delete flag; false = removed from UI';
COMMENT ON COLUMN family_members.avatar_data IS 'Client-compressed JPEG bytes, served via GET /members/{id}/avatar';
```

- [ ] **Step 4: Write the entity**

Create `backend/src/main/kotlin/com/familyhub/members/FamilyMember.kt`:

```kotlin
package com.familyhub.members

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Entity
@Table(name = "family_members")
class FamilyMember(
    @Column(nullable = false)
    var name: String,

    @Column(nullable = false)
    var role: String,

    @Column(nullable = false)
    var color: String,

    @Column(name = "date_of_birth")
    var dateOfBirth: LocalDate? = null,

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "avatar_data")
    var avatarData: ByteArray? = null,

    @Column(name = "avatar_url")
    var avatarUrl: String? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @UpdateTimestamp
    @Column(name = "updated_at")
    var updatedAt: Instant? = null
}
```

- [ ] **Step 5: Write the repository**

Create `backend/src/main/kotlin/com/familyhub/members/FamilyMemberRepository.kt`:

```kotlin
package com.familyhub.members

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FamilyMemberRepository : JpaRepository<FamilyMember, UUID> {
    fun findByIsActiveTrueOrderByCreatedAtAsc(): List<FamilyMember>
    fun countByIsActiveTrue(): Long
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.FamilyMemberRepositoryIntegrationTest"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__extend_family_members.sql \
        backend/src/main/kotlin/com/familyhub/members/FamilyMember.kt \
        backend/src/main/kotlin/com/familyhub/members/FamilyMemberRepository.kt \
        backend/src/test/kotlin/com/familyhub/members/FamilyMemberRepositoryIntegrationTest.kt
git commit -m "feat(backend): extend family_members schema and add JPA entity"
```

---

### Task 2: V3 migration + Setting entity + repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__settings_setup_keys.sql`
- Create: `backend/src/main/kotlin/com/familyhub/settings/Setting.kt`
- Create: `backend/src/main/kotlin/com/familyhub/settings/SettingRepository.kt`
- Test: `backend/src/test/kotlin/com/familyhub/settings/SettingRepositoryIntegrationTest.kt`

**Interfaces:**
- Produces:
  - `Setting` entity — `@Id key: String`, `value: String`, `updatedAt: Instant?`. Primary constructor `Setting(key, value)`.
  - `SettingRepository : JpaRepository<Setting, String>`.
  - Seeded rows after migration: `setup.completed = "false"`, `setup.step = "1"`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/settings/SettingRepositoryIntegrationTest.kt`:

```kotlin
package com.familyhub.settings

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class SettingRepositoryIntegrationTest : BaseIntegrationTest() {

    @Autowired
    lateinit var repository: SettingRepository

    @Test
    fun `V3 seeds setup keys`() {
        assertThat(repository.findById("setup.completed").orElseThrow().value).isEqualTo("false")
        assertThat(repository.findById("setup.step").orElseThrow().value).isEqualTo("1")
    }

    @Test
    fun `saves and updates a setting value`() {
        repository.save(Setting(key = "pin", value = "1234"))
        val stored = repository.findById("pin").orElseThrow()
        assertThat(stored.value).isEqualTo("1234")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingRepositoryIntegrationTest"`
Expected: FAIL — `Setting` / `SettingRepository` unresolved.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V3__settings_setup_keys.sql`:

```sql
-- V3: Seed setup-wizard control keys into the existing settings table

INSERT INTO settings (key, value) VALUES ('setup.completed', 'false');
INSERT INTO settings (key, value) VALUES ('setup.step', '1');
```

- [ ] **Step 4: Write the entity**

Create `backend/src/main/kotlin/com/familyhub/settings/Setting.kt`:

```kotlin
package com.familyhub.settings

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.UpdateTimestamp
import java.time.Instant

@Entity
@Table(name = "settings")
class Setting(
    @Id
    var key: String,

    @Column(nullable = false)
    var value: String,
) {
    @UpdateTimestamp
    @Column(name = "updated_at")
    var updatedAt: Instant? = null
}
```

- [ ] **Step 5: Write the repository**

Create `backend/src/main/kotlin/com/familyhub/settings/SettingRepository.kt`:

```kotlin
package com.familyhub.settings

import org.springframework.data.jpa.repository.JpaRepository

interface SettingRepository : JpaRepository<Setting, String>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingRepositoryIntegrationTest"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__settings_setup_keys.sql \
        backend/src/main/kotlin/com/familyhub/settings/Setting.kt \
        backend/src/main/kotlin/com/familyhub/settings/SettingRepository.kt \
        backend/src/test/kotlin/com/familyhub/settings/SettingRepositoryIntegrationTest.kt
git commit -m "feat(backend): seed setup keys and add Setting entity"
```

---

### Task 3: Extend the OpenAPI spec (members, settings, avatar)

**Files:**
- Modify: `api/openapi.yml` (append tags, paths, schemas)

**Interfaces:**
- Produces the generated interfaces & models used by every later task:
  - `com.familyhub.generated.api.MembersApi` — `listMembers()`, `createMember(memberRequest)`, `updateMember(id, memberRequest)`, `deleteMember(id)`.
  - `com.familyhub.generated.api.SettingsApi` — `getSetupStatus()`, `setPin(setPinRequest)`, `verifyPin(verifyPinRequest)`, `changePin(changePinRequest)`, `updateSetupStep(setupStepRequest)`.
  - `com.familyhub.generated.api.AvatarApi` — generated but intentionally **not implemented** (avatar handled by a hand-written controller for binary control).
  - Models: `MemberRequest`, `MemberResponse`, `SetupStatusResponse`, `SetPinRequest`, `VerifyPinRequest`, `ChangePinRequest`, `SetupStepRequest`, `SessionTokenResponse`.
  - `role` and `color` are plain `String` (validated by `pattern`) — **not** generated enums — to keep entity mapping trivial.

- [ ] **Step 1: Add tags**

In `api/openapi.yml`, replace the `tags:` block with:

```yaml
tags:
  - name: System
    description: Health and operational endpoints
  - name: Members
    description: Family member management
  - name: Settings
    description: Setup status and PIN management
  - name: Avatar
    description: Member avatar image (binary)
```

- [ ] **Step 2: Add paths**

In `api/openapi.yml`, inside `paths:` (after the `/health` block), add:

```yaml
  /v1/members:
    get:
      operationId: listMembers
      summary: List active family members
      tags: [Members]
      security: []
      responses:
        "200":
          description: Active members
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/MemberResponse"
    post:
      operationId: createMember
      summary: Create a family member
      tags: [Members]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/MemberRequest"
      responses:
        "201":
          description: Created member
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MemberResponse"

  /v1/members/{id}:
    put:
      operationId: updateMember
      summary: Update a family member
      tags: [Members]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/MemberRequest"
      responses:
        "200":
          description: Updated member
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MemberResponse"
    delete:
      operationId: deleteMember
      summary: Soft-delete a family member
      tags: [Members]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "204":
          description: Deleted

  /v1/members/{id}/avatar:
    get:
      operationId: getMemberAvatar
      summary: Get a member avatar JPEG
      tags: [Avatar]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Avatar image
          content:
            image/jpeg:
              schema:
                type: string
                format: binary
    put:
      operationId: uploadMemberAvatar
      summary: Upload a member avatar JPEG (already client-compressed)
      tags: [Avatar]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          image/jpeg:
            schema:
              type: string
              format: binary
      responses:
        "204":
          description: Stored

  /v1/settings/setup-status:
    get:
      operationId: getSetupStatus
      summary: Read setup wizard status
      tags: [Settings]
      security: []
      responses:
        "200":
          description: Setup status
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SetupStatusResponse"

  /v1/settings/setup-step:
    post:
      operationId: updateSetupStep
      summary: Persist the current wizard step (only while setup incomplete)
      tags: [Settings]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SetupStepRequest"
      responses:
        "204":
          description: Stored

  /v1/settings/set-pin:
    post:
      operationId: setPin
      summary: Set the initial PIN and complete setup
      tags: [Settings]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SetPinRequest"
      responses:
        "200":
          description: Session token
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SessionTokenResponse"

  /v1/settings/verify-pin:
    post:
      operationId: verifyPin
      summary: Verify the PIN and open a session
      tags: [Settings]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/VerifyPinRequest"
      responses:
        "200":
          description: Session token
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SessionTokenResponse"

  /v1/settings/change-pin:
    post:
      operationId: changePin
      summary: Change the PIN (requires an active PIN session)
      tags: [Settings]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ChangePinRequest"
      responses:
        "204":
          description: Changed
```

- [ ] **Step 3: Add schemas**

In `api/openapi.yml`, inside `components: schemas:` (after `ErrorResponse`), add:

```yaml
    MemberRequest:
      type: object
      required: [name, role, color]
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 100
          example: Anna
        role:
          type: string
          pattern: "^(parent|child)$"
          example: parent
        color:
          type: string
          pattern: "^(blue|pink|green|purple|orange|teal)$"
          example: blue
        dateOfBirth:
          type: string
          format: date
          example: "2015-04-01"

    MemberResponse:
      type: object
      required: [id, name, role, color, isActive, createdAt, updatedAt]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        role:
          type: string
        color:
          type: string
        dateOfBirth:
          type: string
          format: date
        isActive:
          type: boolean
        avatarUrl:
          type: string
          description: Present when an avatar exists, else null
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    SetupStatusResponse:
      type: object
      required: [setupCompleted, currentStep, hasFamilyMembers, hasPin]
      properties:
        setupCompleted:
          type: boolean
        currentStep:
          type: integer
          format: int32
        hasFamilyMembers:
          type: boolean
        hasPin:
          type: boolean

    SetupStepRequest:
      type: object
      required: [step]
      properties:
        step:
          type: integer
          format: int32
          minimum: 1
          maximum: 3

    SetPinRequest:
      type: object
      required: [pin]
      properties:
        pin:
          type: string
          pattern: "^[0-9]{4,6}$"
          example: "1234"

    VerifyPinRequest:
      type: object
      required: [pin]
      properties:
        pin:
          type: string
          example: "1234"

    ChangePinRequest:
      type: object
      required: [currentPin, newPin]
      properties:
        currentPin:
          type: string
          example: "1234"
        newPin:
          type: string
          pattern: "^[0-9]{4,6}$"
          example: "5678"

    SessionTokenResponse:
      type: object
      required: [sessionToken]
      properties:
        sessionToken:
          type: string
          format: uuid
```

- [ ] **Step 4: Regenerate & compile to verify the spec**

Run: `cd backend && ./gradlew openApiGenerate compileKotlin`
Expected: BUILD SUCCESSFUL. Generated interfaces appear under `backend/build/generated/openapi/src/main/kotlin/com/familyhub/generated/`.

- [ ] **Step 5: Commit**

```bash
git add api/openapi.yml
git commit -m "feat(api): add members, settings and avatar endpoints to OpenAPI spec"
```

---

### Task 4: Domain exceptions + GlobalExceptionHandler additions

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/shared/exceptions/GlobalExceptionHandler.kt`
- Test: `backend/src/test/kotlin/com/familyhub/shared/exceptions/DomainExceptionHandlerTest.kt`

**Interfaces:**
- Consumes: existing `ErrorResponse(code, message, correlationId = <uuid>)`, existing `GlobalExceptionHandler`.
- Produces exceptions used by services/controllers later:
  - `SetupAlreadyCompletedException` → HTTP 403, code `SETUP_COMPLETED`
  - `InvalidPinException` → HTTP 401, code `INVALID_PIN`
  - `ValidationException(message)` → HTTP 400, code `VALIDATION_ERROR`
  - `MemberNotFoundException` → HTTP 404, code `NOT_FOUND`
  - `PayloadTooLargeException` → HTTP 413, code `PAYLOAD_TOO_LARGE`
  - `MethodArgumentNotValidException` (from `@Valid`) → HTTP 400, code `VALIDATION_ERROR`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/shared/exceptions/DomainExceptionHandlerTest.kt`. This uses a throwaway `@RestController` to drive each handler branch:

```kotlin
package com.familyhub.shared.exceptions

import com.familyhub.shared.security.SecurityConfig
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import jakarta.validation.Valid
import jakarta.validation.constraints.Size

@RestController
@RequestMapping("/api/test-errors")
private class ErrorProbeController {
    @GetMapping("/setup-completed") fun setup(): Nothing = throw SetupAlreadyCompletedException()
    @GetMapping("/invalid-pin") fun pin(): Nothing = throw InvalidPinException()
    @GetMapping("/validation") fun validation(): Nothing = throw ValidationException("Ungültig")
    @GetMapping("/not-found") fun notFound(): Nothing = throw MemberNotFoundException()
    @GetMapping("/too-large") fun tooLarge(): Nothing = throw PayloadTooLargeException()

    data class Body(@field:Size(min = 2) val name: String)
    @PostMapping("/bean") fun bean(@Valid @RequestBody body: Body) = body.name
}

@WebMvcTest(ErrorProbeController::class)
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
class DomainExceptionHandlerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `setup completed maps to 403`() {
        mockMvc.get("/api/test-errors/setup-completed").andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("SETUP_COMPLETED") }
        }
    }

    @Test
    fun `invalid pin maps to 401`() {
        mockMvc.get("/api/test-errors/invalid-pin").andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("INVALID_PIN") }
        }
    }

    @Test
    fun `validation maps to 400`() {
        mockMvc.get("/api/test-errors/validation").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.message") { value("Ungültig") }
        }
    }

    @Test
    fun `member not found maps to 404`() {
        mockMvc.get("/api/test-errors/not-found").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("NOT_FOUND") }
        }
    }

    @Test
    fun `payload too large maps to 413`() {
        mockMvc.get("/api/test-errors/too-large").andExpect {
            status { value(413) }
            jsonPath("$.code") { value("PAYLOAD_TOO_LARGE") }
        }
    }

    @Test
    fun `bean validation maps to 400`() {
        mockMvc.post("/api/test-errors/bean") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"a"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.shared.exceptions.DomainExceptionHandlerTest"`
Expected: FAIL — exception classes unresolved.

- [ ] **Step 3: Create the exceptions**

Create `backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt`:

```kotlin
package com.familyhub.shared.exceptions

class SetupAlreadyCompletedException : RuntimeException("Setup ist bereits abgeschlossen")

class InvalidPinException : RuntimeException("PIN ist ungültig")

class ValidationException(message: String) : RuntimeException(message)

class MemberNotFoundException : RuntimeException("Mitglied nicht gefunden")

class PayloadTooLargeException : RuntimeException("Das Bild ist zu groß für den Server")
```

- [ ] **Step 4: Extend the handler**

Add these handlers to `backend/src/main/kotlin/com/familyhub/shared/exceptions/GlobalExceptionHandler.kt` — insert **before** the existing `@ExceptionHandler(Exception::class)` method (order matters: the generic handler is the fallback), and add the imports at the top:

```kotlin
import org.springframework.web.bind.MethodArgumentNotValidException
```

```kotlin
    @ExceptionHandler(SetupAlreadyCompletedException::class)
    fun handleSetupCompleted(ex: SetupAlreadyCompletedException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(
            ErrorResponse(code = "SETUP_COMPLETED", message = ex.message ?: "Setup abgeschlossen")
        )

    @ExceptionHandler(InvalidPinException::class)
    fun handleInvalidPin(ex: InvalidPinException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
            ErrorResponse(code = "INVALID_PIN", message = ex.message ?: "PIN ungültig")
        )

    @ExceptionHandler(ValidationException::class)
    fun handleValidation(ex: ValidationException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ErrorResponse(code = "VALIDATION_ERROR", message = ex.message ?: "Ungültige Anfrage")
        )

    @ExceptionHandler(MemberNotFoundException::class)
    fun handleMemberNotFound(ex: MemberNotFoundException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            ErrorResponse(code = "NOT_FOUND", message = ex.message ?: "Nicht gefunden")
        )

    @ExceptionHandler(PayloadTooLargeException::class)
    fun handlePayloadTooLarge(ex: PayloadTooLargeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(
            ErrorResponse(code = "PAYLOAD_TOO_LARGE", message = ex.message ?: "Zu groß")
        )

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleBeanValidation(ex: MethodArgumentNotValidException): ResponseEntity<ErrorResponse> {
        val detail = ex.bindingResult.fieldErrors.firstOrNull()?.let { "${it.field}: ${it.defaultMessage}" }
            ?: "Ungültige Anfrage"
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ErrorResponse(code = "VALIDATION_ERROR", message = detail)
        )
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.shared.exceptions.DomainExceptionHandlerTest"`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt \
        backend/src/main/kotlin/com/familyhub/shared/exceptions/GlobalExceptionHandler.kt \
        backend/src/test/kotlin/com/familyhub/shared/exceptions/DomainExceptionHandlerTest.kt
git commit -m "feat(backend): add domain exceptions and HTTP mappings"
```

---

### Task 5: PinSessionService + Clock bean

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/shared/config/ClockConfig.kt`
- Create: `backend/src/main/kotlin/com/familyhub/pin/PinSessionService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/pin/PinSessionServiceTest.kt`

**Interfaces:**
- Produces:
  - `ClockConfig` — `@Bean fun clock(): Clock = Clock.systemUTC()` (in excluded `config` package).
  - `PinSessionService(clock: Clock)` with `createSession(): UUID`, `isValid(token: UUID): Boolean`, and `companion object { val TIMEOUT: Duration = Duration.ofMinutes(15) }`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/pin/PinSessionServiceTest.kt`:

```kotlin
package com.familyhub.pin

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

private class MutableClock(var instant: Instant) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = instant
}

class PinSessionServiceTest {

    private val clock = MutableClock(Instant.parse("2026-07-22T10:00:00Z"))
    private val service = PinSessionService(clock)

    @Test
    fun `a fresh session is valid`() {
        val token = service.createSession()
        assertThat(service.isValid(token)).isTrue()
    }

    @Test
    fun `unknown token is invalid`() {
        assertThat(service.isValid(UUID.randomUUID())).isFalse()
    }

    @Test
    fun `session expires after 15 minutes of inactivity`() {
        val token = service.createSession()
        clock.instant = clock.instant.plus(Duration.ofMinutes(15))
        assertThat(service.isValid(token)).isFalse()
        // second check confirms the token was removed
        assertThat(service.isValid(token)).isFalse()
    }

    @Test
    fun `activity within the window slides the timeout`() {
        val token = service.createSession()
        clock.instant = clock.instant.plus(Duration.ofMinutes(14))
        assertThat(service.isValid(token)).isTrue()   // refreshes last-accessed
        clock.instant = clock.instant.plus(Duration.ofMinutes(14))
        assertThat(service.isValid(token)).isTrue()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.pin.PinSessionServiceTest"`
Expected: FAIL — `PinSessionService` unresolved.

- [ ] **Step 3: Create the Clock bean**

Create `backend/src/main/kotlin/com/familyhub/shared/config/ClockConfig.kt`:

```kotlin
package com.familyhub.shared.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

@Configuration
class ClockConfig {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
```

- [ ] **Step 4: Create the service**

Create `backend/src/main/kotlin/com/familyhub/pin/PinSessionService.kt`:

```kotlin
package com.familyhub.pin

import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Service
class PinSessionService(private val clock: Clock) {

    private val sessions = ConcurrentHashMap<UUID, Instant>()

    fun createSession(): UUID {
        val token = UUID.randomUUID()
        sessions[token] = Instant.now(clock)
        return token
    }

    fun isValid(token: UUID): Boolean {
        val lastAccessed = sessions[token] ?: return false
        if (Duration.between(lastAccessed, Instant.now(clock)) >= TIMEOUT) {
            sessions.remove(token)
            return false
        }
        sessions[token] = Instant.now(clock)
        return true
    }

    companion object {
        val TIMEOUT: Duration = Duration.ofMinutes(15)
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.pin.PinSessionServiceTest"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/shared/config/ClockConfig.kt \
        backend/src/main/kotlin/com/familyhub/pin/PinSessionService.kt \
        backend/src/test/kotlin/com/familyhub/pin/PinSessionServiceTest.kt
git commit -m "feat(backend): add in-memory PIN session service"
```

---

### Task 6: RequiresPinSession + interceptor + wiring + security update

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/pin/RequiresPinSession.kt`
- Create: `backend/src/main/kotlin/com/familyhub/pin/PinSessionInterceptor.kt`
- Create: `backend/src/main/kotlin/com/familyhub/shared/config/InterceptorConfig.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/shared/security/SecurityConfig.kt`
- Test: `backend/src/test/kotlin/com/familyhub/pin/PinSessionInterceptorTest.kt`

**Interfaces:**
- Consumes: `PinSessionService.isValid`, `SettingRepository` (reads `setup.completed`), `ObjectMapper`, `ErrorResponse`.
- Produces:
  - `@RequiresPinSession` (target FUNCTION, runtime retention) — marks protected handler methods.
  - `PinSessionInterceptor : HandlerInterceptor` — `preHandle` returns `true` (pass) or `false` (writes 401 JSON). Rules: non-`HandlerMethod` → pass; method lacks `@RequiresPinSession` → pass; `setup.completed != "true"` → pass; else require a valid `X-Pin-Session` UUID header.
  - `InterceptorConfig : WebMvcConfigurer` registering the interceptor on `/api/**` via `ObjectProvider` (so `@WebMvcTest` slices that don't load the interceptor don't fail).
  - `SecurityConfig` changed to `.anyRequest().permitAll()` (Spring Security is not the auth mechanism; the interceptor is).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/pin/PinSessionInterceptorTest.kt`:

```kotlin
package com.familyhub.pin

import com.fasterxml.jackson.databind.ObjectMapper
import com.familyhub.settings.Setting
import com.familyhub.settings.SettingRepository
import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.web.method.HandlerMethod
import java.io.PrintWriter
import java.io.StringWriter
import java.util.Optional
import java.util.UUID

class PinSessionInterceptorTest {

    private val sessionService = mockk<PinSessionService>()
    private val settingRepository = mockk<SettingRepository>()
    private val interceptor = PinSessionInterceptor(sessionService, settingRepository, ObjectMapper())

    // A real handler method carrying (or not carrying) the annotation.
    @RequiresPinSession
    fun protectedHandler() = Unit
    fun openHandler() = Unit

    private fun handlerMethod(name: String) =
        HandlerMethod(this, this::class.java.getDeclaredMethod(name))

    private fun setupCompleted(value: Boolean) {
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = value.toString()))
    }

    private fun response(): Pair<HttpServletResponse, StringWriter> {
        val writer = StringWriter()
        val response = mockk<HttpServletResponse>(relaxed = true)
        every { response.writer } returns PrintWriter(writer)
        return response to writer
    }

    @Test
    fun `non-handler-method passes through`() {
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, "not-a-handler-method")).isTrue()
    }

    @Test
    fun `unannotated handler passes through`() {
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("openHandler"))).isTrue()
    }

    @Test
    fun `protected handler passes through while setup incomplete`() {
        setupCompleted(false)
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isTrue()
    }

    @Test
    fun `protected handler with missing header returns 401`() {
        setupCompleted(true)
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns null
        val (res, writer) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
        assertThat(writer.toString()).contains("UNAUTHORIZED")
    }

    @Test
    fun `protected handler with non-uuid header returns 401`() {
        setupCompleted(true)
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns "not-a-uuid"
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
    }

    @Test
    fun `protected handler with invalid token returns 401`() {
        setupCompleted(true)
        val token = UUID.randomUUID()
        every { sessionService.isValid(token) } returns false
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns token.toString()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
    }

    @Test
    fun `protected handler with valid token passes through`() {
        setupCompleted(true)
        val token = UUID.randomUUID()
        every { sessionService.isValid(token) } returns true
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns token.toString()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isTrue()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.pin.PinSessionInterceptorTest"`
Expected: FAIL — `RequiresPinSession` / `PinSessionInterceptor` unresolved.

- [ ] **Step 3: Create the annotation**

Create `backend/src/main/kotlin/com/familyhub/pin/RequiresPinSession.kt`:

```kotlin
package com.familyhub.pin

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresPinSession
```

- [ ] **Step 4: Create the interceptor**

Create `backend/src/main/kotlin/com/familyhub/pin/PinSessionInterceptor.kt`:

```kotlin
package com.familyhub.pin

import com.fasterxml.jackson.databind.ObjectMapper
import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.ErrorResponse
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import java.util.UUID

@Component
class PinSessionInterceptor(
    private val pinSessionService: PinSessionService,
    private val settingRepository: SettingRepository,
    private val objectMapper: ObjectMapper,
) : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (handler !is HandlerMethod) return true
        if (!handler.hasMethodAnnotation(RequiresPinSession::class.java)) return true
        if (!isSetupCompleted()) return true

        val header = request.getHeader("X-Pin-Session")
        if (header == null || !isValidToken(header)) {
            writeUnauthorized(response)
            return false
        }
        return true
    }

    private fun isSetupCompleted(): Boolean =
        settingRepository.findById("setup.completed").map { it.value == "true" }.orElse(false)

    private fun isValidToken(header: String): Boolean {
        val token = try {
            UUID.fromString(header)
        } catch (ex: IllegalArgumentException) {
            return false
        }
        return pinSessionService.isValid(token)
    }

    private fun writeUnauthorized(response: HttpServletResponse) {
        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.writer.write(
            objectMapper.writeValueAsString(
                ErrorResponse(code = "UNAUTHORIZED", message = "PIN-Sitzung erforderlich")
            )
        )
    }
}
```

- [ ] **Step 5: Register the interceptor**

Create `backend/src/main/kotlin/com/familyhub/shared/config/InterceptorConfig.kt`:

```kotlin
package com.familyhub.shared.config

import com.familyhub.pin.PinSessionInterceptor
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class InterceptorConfig(
    private val interceptorProvider: ObjectProvider<PinSessionInterceptor>,
) : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        interceptorProvider.ifAvailable {
            registry.addInterceptor(it).addPathPatterns("/api/**")
        }
    }
}
```

- [ ] **Step 6: Relax Spring Security to permit all (interceptor enforces PIN)**

Replace the `authorizeHttpRequests` block in `backend/src/main/kotlin/com/familyhub/shared/security/SecurityConfig.kt` so the whole method reads:

```kotlin
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .formLogin { it.disable() }
            .httpBasic { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { auth ->
                // PIN protection is enforced by PinSessionInterceptor, not Spring Security.
                auth.anyRequest().permitAll()
            }

        return http.build()
    }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.pin.PinSessionInterceptorTest"`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/pin/RequiresPinSession.kt \
        backend/src/main/kotlin/com/familyhub/pin/PinSessionInterceptor.kt \
        backend/src/main/kotlin/com/familyhub/shared/config/InterceptorConfig.kt \
        backend/src/main/kotlin/com/familyhub/shared/security/SecurityConfig.kt \
        backend/src/test/kotlin/com/familyhub/pin/PinSessionInterceptorTest.kt
git commit -m "feat(backend): enforce PIN sessions via handler interceptor"
```

---

### Task 7: SettingsService

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/settings/SettingsService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/settings/SettingsServiceTest.kt`

**Interfaces:**
- Consumes: `SettingRepository`, `FamilyMemberRepository.countByIsActiveTrue()`, `PinSessionService.createSession()`, domain exceptions.
- Produces `SettingsService` with:
  - `getSetupStatus(): SetupStatusResponse` (generated model)
  - `updateSetupStep(step: Int)` — throws `SetupAlreadyCompletedException` if completed, `ValidationException` if step not in 1..3
  - `setPin(pin: String): String` (returns session token as string) — throws `SetupAlreadyCompletedException` if already completed, `ValidationException` on bad format; sets `pin`, `setup.completed=true`
  - `verifyPin(pin: String): String` — throws `InvalidPinException` if no/wrong PIN
  - `changePin(currentPin: String, newPin: String)` — throws `InvalidPinException` if wrong current, `ValidationException` on bad new format
  - Key constants `KEY_PIN="pin"`, `KEY_SETUP_COMPLETED="setup.completed"`, `KEY_SETUP_STEP="setup.step"`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/settings/SettingsServiceTest.kt`:

```kotlin
package com.familyhub.settings

import com.familyhub.members.FamilyMemberRepository
import com.familyhub.pin.PinSessionService
import com.familyhub.shared.exceptions.InvalidPinException
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class SettingsServiceTest {

    private val settingRepository = mockk<SettingRepository>(relaxed = true)
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val pinSessionService = mockk<PinSessionService>()
    private val service = SettingsService(settingRepository, memberRepository, pinSessionService)

    private fun stubSetting(key: String, value: String?) {
        every { settingRepository.findById(key) } returns
            (value?.let { Optional.of(Setting(key = key, value = it)) } ?: Optional.empty())
    }

    @Test
    fun `getSetupStatus reflects stored keys and member count`() {
        stubSetting("setup.completed", "false")
        stubSetting("setup.step", "2")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L

        val status = service.getSetupStatus()
        assertThat(status.setupCompleted).isFalse()
        assertThat(status.currentStep).isEqualTo(2)
        assertThat(status.hasFamilyMembers).isTrue()
        assertThat(status.hasPin).isFalse()
    }

    @Test
    fun `getSetupStatus defaults step to 1 when unparaseable`() {
        stubSetting("setup.completed", "true")
        stubSetting("setup.step", null)
        stubSetting("pin", "1234")
        every { memberRepository.countByIsActiveTrue() } returns 0L

        val status = service.getSetupStatus()
        assertThat(status.currentStep).isEqualTo(1)
        assertThat(status.hasPin).isTrue()
        assertThat(status.hasFamilyMembers).isFalse()
    }

    @Test
    fun `updateSetupStep rejects when setup already completed`() {
        stubSetting("setup.completed", "true")
        assertThatThrownBy { service.updateSetupStep(2) }
            .isInstanceOf(SetupAlreadyCompletedException::class.java)
    }

    @Test
    fun `updateSetupStep rejects out-of-range step`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.updateSetupStep(4) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `updateSetupStep stores valid step`() {
        stubSetting("setup.completed", "false")
        stubSetting("setup.step", "1")
        service.updateSetupStep(3)
        val saved = slot<Setting>()
        verify { settingRepository.save(capture(saved)) }
        assertThat(saved.captured.key).isEqualTo("setup.step")
        assertThat(saved.captured.value).isEqualTo("3")
    }

    @Test
    fun `setPin rejects when already completed`() {
        stubSetting("setup.completed", "true")
        assertThatThrownBy { service.setPin("1234") }
            .isInstanceOf(SetupAlreadyCompletedException::class.java)
    }

    @Test
    fun `setPin rejects bad format`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.setPin("12") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `setPin stores pin, completes setup and returns token`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        val token = UUID.randomUUID()
        every { pinSessionService.createSession() } returns token

        val result = service.setPin("1234")
        assertThat(result).isEqualTo(token.toString())
        verify { settingRepository.save(match { it.key == "pin" && it.value == "1234" }) }
        verify { settingRepository.save(match { it.key == "setup.completed" && it.value == "true" }) }
    }

    @Test
    fun `verifyPin rejects when no pin set`() {
        stubSetting("pin", null)
        assertThatThrownBy { service.verifyPin("1234") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `verifyPin rejects wrong pin`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.verifyPin("9999") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `verifyPin returns token on match`() {
        stubSetting("pin", "1234")
        val token = UUID.randomUUID()
        every { pinSessionService.createSession() } returns token
        assertThat(service.verifyPin("1234")).isEqualTo(token.toString())
    }

    @Test
    fun `changePin rejects wrong current pin`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.changePin("0000", "5678") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `changePin rejects bad new format`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.changePin("1234", "12") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `changePin stores new pin`() {
        stubSetting("pin", "1234")
        service.changePin("1234", "5678")
        verify { settingRepository.save(match { it.key == "pin" && it.value == "5678" }) }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingsServiceTest"`
Expected: FAIL — `SettingsService` unresolved.

- [ ] **Step 3: Create the service**

Create `backend/src/main/kotlin/com/familyhub/settings/SettingsService.kt`:

```kotlin
package com.familyhub.settings

import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.pin.PinSessionService
import com.familyhub.shared.exceptions.InvalidPinException
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SettingsService(
    private val settingRepository: SettingRepository,
    private val memberRepository: FamilyMemberRepository,
    private val pinSessionService: PinSessionService,
) {

    fun getSetupStatus(): SetupStatusResponse = SetupStatusResponse(
        setupCompleted = getValue(KEY_SETUP_COMPLETED) == "true",
        currentStep = getValue(KEY_SETUP_STEP)?.toIntOrNull() ?: 1,
        hasFamilyMembers = memberRepository.countByIsActiveTrue() > 0,
        hasPin = getValue(KEY_PIN) != null,
    )

    @Transactional
    fun updateSetupStep(step: Int) {
        requireSetupNotCompleted()
        if (step !in 1..3) throw ValidationException("Ungültiger Schritt")
        setValue(KEY_SETUP_STEP, step.toString())
    }

    @Transactional
    fun setPin(pin: String): String {
        requireSetupNotCompleted()
        validatePinFormat(pin)
        setValue(KEY_PIN, pin)
        setValue(KEY_SETUP_COMPLETED, "true")
        return pinSessionService.createSession().toString()
    }

    fun verifyPin(pin: String): String {
        val stored = getValue(KEY_PIN) ?: throw InvalidPinException()
        if (stored != pin) throw InvalidPinException()
        return pinSessionService.createSession().toString()
    }

    @Transactional
    fun changePin(currentPin: String, newPin: String) {
        val stored = getValue(KEY_PIN) ?: throw InvalidPinException()
        if (stored != currentPin) throw InvalidPinException()
        validatePinFormat(newPin)
        setValue(KEY_PIN, newPin)
    }

    private fun requireSetupNotCompleted() {
        if (getValue(KEY_SETUP_COMPLETED) == "true") throw SetupAlreadyCompletedException()
    }

    private fun validatePinFormat(pin: String) {
        if (!pin.matches(Regex("^\\d{4,6}$"))) {
            throw ValidationException("PIN muss 4 bis 6 Ziffern enthalten")
        }
    }

    private fun getValue(key: String): String? =
        settingRepository.findById(key).map { it.value }.orElse(null)

    private fun setValue(key: String, value: String) {
        val setting = settingRepository.findById(key).orElse(Setting(key = key, value = value))
        setting.value = value
        settingRepository.save(setting)
    }

    companion object {
        const val KEY_PIN = "pin"
        const val KEY_SETUP_COMPLETED = "setup.completed"
        const val KEY_SETUP_STEP = "setup.step"
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingsServiceTest"`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/settings/SettingsService.kt \
        backend/src/test/kotlin/com/familyhub/settings/SettingsServiceTest.kt
git commit -m "feat(backend): add settings/PIN service logic"
```

---

### Task 8: SettingsController

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/settings/SettingsController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/settings/SettingsControllerTest.kt`

**Interfaces:**
- Consumes: generated `SettingsApi`, `SettingsService`.
- Produces `SettingsController : SettingsApi` mapped at `@RequestMapping("/api")`. Delegates each operation; wraps `setPin`/`verifyPin` results in `SessionTokenResponse`; returns `204` for `changePin`/`updateSetupStep`. `changePin` is annotated `@RequiresPinSession`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/settings/SettingsControllerTest.kt`:

```kotlin
package com.familyhub.settings

import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@WebMvcTest(SettingsController::class)
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
class SettingsControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var settingsService: SettingsService

    @Test
    fun `GET setup-status returns status json`() {
        every { settingsService.getSetupStatus() } returns SetupStatusResponse(
            setupCompleted = false, currentStep = 1, hasFamilyMembers = false, hasPin = false
        )
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            status { isOk() }
            jsonPath("$.setupCompleted") { value(false) }
            jsonPath("$.currentStep") { value(1) }
        }
    }

    @Test
    fun `POST set-pin returns session token`() {
        every { settingsService.setPin("1234") } returns "550e8400-e29b-41d4-a716-446655440000"
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { value("550e8400-e29b-41d4-a716-446655440000") }
        }
    }

    @Test
    fun `POST set-pin maps SetupAlreadyCompleted to 403`() {
        every { settingsService.setPin("1234") } throws SetupAlreadyCompletedException()
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("SETUP_COMPLETED") }
        }
    }

    @Test
    fun `POST verify-pin returns session token`() {
        every { settingsService.verifyPin("1234") } returns "tok-123"
        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { value("tok-123") }
        }
    }

    @Test
    fun `POST change-pin returns 204`() {
        every { settingsService.changePin("1234", "5678") } returns Unit
        mockMvc.post("/api/v1/settings/change-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPin":"1234","newPin":"5678"}"""
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `POST setup-step returns 204`() {
        every { settingsService.updateSetupStep(2) } returns Unit
        mockMvc.post("/api/v1/settings/setup-step") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"step":2}"""
        }.andExpect {
            status { isNoContent() }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingsControllerTest"`
Expected: FAIL — `SettingsController` unresolved.

- [ ] **Step 3: Create the controller**

Create `backend/src/main/kotlin/com/familyhub/settings/SettingsController.kt`:

```kotlin
package com.familyhub.settings

import com.familyhub.generated.api.SettingsApi
import com.familyhub.generated.model.ChangePinRequest
import com.familyhub.generated.model.SessionTokenResponse
import com.familyhub.generated.model.SetPinRequest
import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.generated.model.SetupStepRequest
import com.familyhub.generated.model.VerifyPinRequest
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class SettingsController(
    private val settingsService: SettingsService,
) : SettingsApi {

    override fun getSetupStatus(): ResponseEntity<SetupStatusResponse> =
        ResponseEntity.ok(settingsService.getSetupStatus())

    override fun updateSetupStep(setupStepRequest: SetupStepRequest): ResponseEntity<Unit> {
        settingsService.updateSetupStep(setupStepRequest.step)
        return ResponseEntity.noContent().build()
    }

    override fun setPin(setPinRequest: SetPinRequest): ResponseEntity<SessionTokenResponse> =
        ResponseEntity.ok(SessionTokenResponse(sessionToken = settingsService.setPin(setPinRequest.pin)))

    override fun verifyPin(verifyPinRequest: VerifyPinRequest): ResponseEntity<SessionTokenResponse> =
        ResponseEntity.ok(SessionTokenResponse(sessionToken = settingsService.verifyPin(verifyPinRequest.pin)))

    @RequiresPinSession
    override fun changePin(changePinRequest: ChangePinRequest): ResponseEntity<Unit> {
        settingsService.changePin(changePinRequest.currentPin, changePinRequest.newPin)
        return ResponseEntity.noContent().build()
    }
}
```

> **Note:** if the generated `SettingsApi` declares a return type other than `ResponseEntity<Unit>` for the 204 operations (e.g. `ResponseEntity<Void>`), match the generated signature exactly and use `ResponseEntity.noContent().build()` (which infers the type).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.settings.SettingsControllerTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/settings/SettingsController.kt \
        backend/src/test/kotlin/com/familyhub/settings/SettingsControllerTest.kt
git commit -m "feat(backend): add settings/PIN REST controller"
```

---

### Task 9: MemberService

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/members/MemberService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/members/MemberServiceTest.kt`

**Interfaces:**
- Consumes: `FamilyMemberRepository`, `MemberRequest`/`MemberResponse` generated models, domain exceptions.
- Produces `MemberService` with:
  - `list(): List<MemberResponse>`
  - `create(req: MemberRequest): MemberResponse` — trims name, `ValidationException` if < 2 chars
  - `update(id: UUID, req: MemberRequest): MemberResponse` — `MemberNotFoundException` if absent
  - `delete(id: UUID)` — soft-delete
  - `getAvatar(id: UUID): ByteArray` — `MemberNotFoundException` if member or avatar absent
  - `saveAvatar(id: UUID, bytes: ByteArray)`
  - `MemberResponse.avatarUrl` = `"/api/v1/members/{id}/avatar"` when `avatarData != null`, else `null`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/members/MemberServiceTest.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.generated.model.MemberRequest
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class MemberServiceTest {

    private val repository = mockk<FamilyMemberRepository>()
    private val service = MemberService(repository)

    private fun member(name: String = "Anna", withAvatar: Boolean = false): FamilyMember {
        val m = FamilyMember(name = name, role = "parent", color = "blue")
        m.id = UUID.randomUUID()
        m.createdAt = Instant.parse("2026-07-22T10:00:00Z")
        m.updatedAt = Instant.parse("2026-07-22T10:00:00Z")
        if (withAvatar) m.avatarData = byteArrayOf(1, 2, 3)
        return m
    }

    @Test
    fun `list maps active members with avatar url`() {
        every { repository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(member(withAvatar = true))
        val result = service.list()
        assertThat(result).hasSize(1)
        assertThat(result[0].name).isEqualTo("Anna")
        assertThat(result[0].avatarUrl).endsWith("/avatar")
    }

    @Test
    fun `list returns null avatar url without avatar`() {
        every { repository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(member())
        assertThat(service.list()[0].avatarUrl).isNull()
    }

    @Test
    fun `create trims name and saves`() {
        every { repository.save(any()) } answers { firstArg<FamilyMember>().also { it.id = UUID.randomUUID(); it.createdAt = Instant.now(); it.updatedAt = Instant.now() } }
        val saved = slot<FamilyMember>()
        service.create(MemberRequest(name = "  Bea  ", role = "child", color = "pink", dateOfBirth = LocalDate.of(2015, 1, 1)))
        verify { repository.save(capture(saved)) }
        assertThat(saved.captured.name).isEqualTo("Bea")
        assertThat(saved.captured.dateOfBirth).isEqualTo(LocalDate.of(2015, 1, 1))
    }

    @Test
    fun `create rejects short name after trim`() {
        assertThatThrownBy {
            service.create(MemberRequest(name = " a ", role = "child", color = "pink"))
        }.isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update modifies existing member`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        val result = service.update(existing.id!!, MemberRequest(name = "Neu", role = "child", color = "green"))
        assertThat(result.name).isEqualTo("Neu")
        assertThat(result.role).isEqualTo("child")
    }

    @Test
    fun `update rejects short name`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThatThrownBy {
            service.update(existing.id!!, MemberRequest(name = "a", role = "child", color = "green"))
        }.isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy {
            service.update(id, MemberRequest(name = "Neu", role = "child", color = "green"))
        }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `delete soft-deletes member`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        service.delete(existing.id!!)
        assertThat(existing.isActive).isFalse()
        verify { repository.save(existing) }
    }

    @Test
    fun `delete throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.delete(id) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `getAvatar returns bytes`() {
        val existing = member(withAvatar = true)
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThat(service.getAvatar(existing.id!!)).containsExactly(1, 2, 3)
    }

    @Test
    fun `getAvatar throws when no avatar`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThatThrownBy { service.getAvatar(existing.id!!) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `getAvatar throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.getAvatar(id) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `saveAvatar stores bytes`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        service.saveAvatar(existing.id!!, byteArrayOf(9, 9))
        assertThat(existing.avatarData).containsExactly(9, 9)
    }

    @Test
    fun `saveAvatar throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.saveAvatar(id, byteArrayOf(1)) }.isInstanceOf(MemberNotFoundException::class.java)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.MemberServiceTest"`
Expected: FAIL — `MemberService` unresolved.

- [ ] **Step 3: Create the service**

Create `backend/src/main/kotlin/com/familyhub/members/MemberService.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.generated.model.MemberRequest
import com.familyhub.generated.model.MemberResponse
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.ZoneOffset
import java.util.UUID

@Service
class MemberService(
    private val repository: FamilyMemberRepository,
) {

    fun list(): List<MemberResponse> =
        repository.findByIsActiveTrueOrderByCreatedAtAsc().map { it.toResponse() }

    @Transactional
    fun create(req: MemberRequest): MemberResponse {
        val name = validName(req.name)
        val member = FamilyMember(
            name = name,
            role = req.role,
            color = req.color,
            dateOfBirth = req.dateOfBirth,
        )
        return repository.save(member).toResponse()
    }

    @Transactional
    fun update(id: UUID, req: MemberRequest): MemberResponse {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.name = validName(req.name)
        member.role = req.role
        member.color = req.color
        member.dateOfBirth = req.dateOfBirth
        return repository.save(member).toResponse()
    }

    @Transactional
    fun delete(id: UUID) {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.isActive = false
        repository.save(member)
    }

    fun getAvatar(id: UUID): ByteArray {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        return member.avatarData ?: throw MemberNotFoundException()
    }

    @Transactional
    fun saveAvatar(id: UUID, bytes: ByteArray) {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.avatarData = bytes
        repository.save(member)
    }

    private fun validName(raw: String): String {
        val name = raw.trim()
        if (name.length < 2) throw ValidationException("Name muss mindestens 2 Zeichen lang sein")
        return name
    }

    private fun FamilyMember.toResponse(): MemberResponse = MemberResponse(
        id = this.id!!,
        name = this.name,
        role = this.role,
        color = this.color,
        isActive = this.isActive,
        createdAt = this.createdAt!!.atOffset(ZoneOffset.UTC),
        updatedAt = this.updatedAt!!.atOffset(ZoneOffset.UTC),
        dateOfBirth = this.dateOfBirth,
        avatarUrl = if (this.avatarData != null) "/api/v1/members/${this.id}/avatar" else null,
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.MemberServiceTest"`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/members/MemberService.kt \
        backend/src/test/kotlin/com/familyhub/members/MemberServiceTest.kt
git commit -m "feat(backend): add member service with avatar handling"
```

---

### Task 10: MembersController + MemberAvatarController

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/members/MembersController.kt`
- Create: `backend/src/main/kotlin/com/familyhub/members/MemberAvatarController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/members/MembersControllerTest.kt`

**Interfaces:**
- Consumes: generated `MembersApi`, `MemberService`, `@RequiresPinSession`, `PayloadTooLargeException`.
- Produces:
  - `MembersController : MembersApi` at `@RequestMapping("/api")` — `listMembers` (public), `createMember`/`updateMember`/`deleteMember` annotated `@RequiresPinSession`.
  - `MemberAvatarController` (hand-written, `@RequestMapping("/api/v1/members")`) — `GET /{id}/avatar` (public, `image/jpeg`), `PUT /{id}/avatar` (`@RequiresPinSession`, consumes `image/jpeg`, rejects bodies > 500 KB with `PayloadTooLargeException`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/kotlin/com/familyhub/members/MembersControllerTest.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.generated.model.MemberResponse
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@WebMvcTest(controllers = [MembersController::class, MemberAvatarController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class MembersControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var memberService: MemberService

    private fun response(id: UUID = UUID.randomUUID()) = MemberResponse(
        id = id, name = "Anna", role = "parent", color = "blue",
        isActive = true,
        createdAt = OffsetDateTime.of(2026, 7, 22, 10, 0, 0, 0, ZoneOffset.UTC),
        updatedAt = OffsetDateTime.of(2026, 7, 22, 10, 0, 0, 0, ZoneOffset.UTC),
        dateOfBirth = null, avatarUrl = null,
    )

    @Test
    fun `GET members returns list`() {
        every { memberService.list() } returns listOf(response())
        mockMvc.get("/api/v1/members").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Anna") }
        }
    }

    @Test
    fun `POST members creates and returns 201`() {
        every { memberService.create(any()) } returns response()
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"parent","color":"blue"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Anna") }
        }
    }

    @Test
    fun `POST members rejects bad role via bean validation`() {
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"boss","color":"blue"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
        }
    }

    @Test
    fun `PUT members updates and returns 200`() {
        val id = UUID.randomUUID()
        every { memberService.update(eq(id), any()) } returns response(id)
        mockMvc.put("/api/v1/members/$id") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"parent","color":"blue"}"""
        }.andExpect {
            status { isOk() }
        }
    }

    @Test
    fun `DELETE members returns 204`() {
        val id = UUID.randomUUID()
        every { memberService.delete(id) } returns Unit
        mockMvc.delete("/api/v1/members/$id").andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `GET avatar returns jpeg bytes`() {
        val id = UUID.randomUUID()
        every { memberService.getAvatar(id) } returns byteArrayOf(1, 2, 3)
        mockMvc.get("/api/v1/members/$id/avatar").andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_JPEG) }
        }
    }

    @Test
    fun `GET avatar 404 when missing`() {
        val id = UUID.randomUUID()
        every { memberService.getAvatar(id) } throws MemberNotFoundException()
        mockMvc.get("/api/v1/members/$id/avatar").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `PUT avatar stores bytes and returns 204`() {
        val id = UUID.randomUUID()
        every { memberService.saveAvatar(eq(id), any()) } returns Unit
        val bytes = slot<ByteArray>()
        mockMvc.put("/api/v1/members/$id/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = byteArrayOf(4, 5, 6)
        }.andExpect {
            status { isNoContent() }
        }
        verify { memberService.saveAvatar(eq(id), capture(bytes)) }
        assert(bytes.captured.contentEquals(byteArrayOf(4, 5, 6)))
    }

    @Test
    fun `PUT avatar rejects oversized body with 413`() {
        val id = UUID.randomUUID()
        mockMvc.put("/api/v1/members/$id/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = ByteArray(500 * 1024 + 1)
        }.andExpect {
            status { value(413) }
            jsonPath("$.code") { value("PAYLOAD_TOO_LARGE") }
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.MembersControllerTest"`
Expected: FAIL — controllers unresolved.

- [ ] **Step 3: Create MembersController**

Create `backend/src/main/kotlin/com/familyhub/members/MembersController.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.generated.api.MembersApi
import com.familyhub.generated.model.MemberRequest
import com.familyhub.generated.model.MemberResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class MembersController(
    private val memberService: MemberService,
) : MembersApi {

    override fun listMembers(): ResponseEntity<List<MemberResponse>> =
        ResponseEntity.ok(memberService.list())

    @RequiresPinSession
    override fun createMember(memberRequest: MemberRequest): ResponseEntity<MemberResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(memberService.create(memberRequest))

    @RequiresPinSession
    override fun updateMember(id: UUID, memberRequest: MemberRequest): ResponseEntity<MemberResponse> =
        ResponseEntity.ok(memberService.update(id, memberRequest))

    @RequiresPinSession
    override fun deleteMember(id: UUID): ResponseEntity<Unit> {
        memberService.delete(id)
        return ResponseEntity.noContent().build()
    }
}
```

> **Note:** match the generated `MembersApi` parameter/return types exactly. If the generated `id` parameter is typed `UUID`, keep `UUID`; if the generator emits `ResponseEntity<Void>` for delete, adjust and use `ResponseEntity.noContent().build()`.

- [ ] **Step 4: Create MemberAvatarController**

Create `backend/src/main/kotlin/com/familyhub/members/MemberAvatarController.kt`:

```kotlin
package com.familyhub.members

import com.familyhub.pin.RequiresPinSession
import com.familyhub.shared.exceptions.PayloadTooLargeException
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/v1/members")
class MemberAvatarController(
    private val memberService: MemberService,
) {

    @GetMapping("/{id}/avatar", produces = [MediaType.IMAGE_JPEG_VALUE])
    fun getAvatar(@PathVariable id: UUID): ResponseEntity<ByteArray> =
        ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(memberService.getAvatar(id))

    @RequiresPinSession
    @PutMapping("/{id}/avatar", consumes = [MediaType.IMAGE_JPEG_VALUE])
    fun putAvatar(@PathVariable id: UUID, @RequestBody bytes: ByteArray): ResponseEntity<Unit> {
        if (bytes.size > MAX_AVATAR_BYTES) throw PayloadTooLargeException()
        memberService.saveAvatar(id, bytes)
        return ResponseEntity.noContent().build()
    }

    companion object {
        const val MAX_AVATAR_BYTES = 500 * 1024
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.members.MembersControllerTest"`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/members/MembersController.kt \
        backend/src/main/kotlin/com/familyhub/members/MemberAvatarController.kt \
        backend/src/test/kotlin/com/familyhub/members/MembersControllerTest.kt
git commit -m "feat(backend): add members and avatar REST controllers"
```

---

### Task 11: End-to-end integration test (setup flow, PIN enforcement, CRUD, avatar)

**Files:**
- Test: `backend/src/test/kotlin/com/familyhub/Schritt2FlowIntegrationTest.kt`

**Interfaces:**
- Consumes: `BaseIntegrationTest` (full Spring context → interceptor active), all endpoints.
- Produces: proof that the interceptor is wired, setup gating works, and the wizard→protected transition behaves.

- [ ] **Step 1: Write the integration test**

Create `backend/src/test/kotlin/com/familyhub/Schritt2FlowIntegrationTest.kt`:

```kotlin
package com.familyhub

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class Schritt2FlowIntegrationTest : BaseIntegrationTest() {

    @Autowired
    lateinit var objectMapper: ObjectMapper

    private fun tokenFrom(json: String): String =
        objectMapper.readTree(json).get("sessionToken").asText()

    @Test
    @Order(1)
    fun `full setup and protection flow`() {
        // 1. Initial status: nothing set up.
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            status { isOk() }
            jsonPath("$.setupCompleted") { value(false) }
            jsonPath("$.hasPin") { value(false) }
            jsonPath("$.hasFamilyMembers") { value(false) }
        }

        // 2. During setup, member creation is allowed WITHOUT a session.
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Papa","role":"parent","color":"blue"}"""
        }.andExpect { status { isCreated() } }

        // 3. Complete setup by setting a PIN → returns a session token.
        val setPinBody = mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val token = tokenFrom(setPinBody)

        // 4. Setup now complete.
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            jsonPath("$.setupCompleted") { value(true) }
            jsonPath("$.hasPin") { value(true) }
            jsonPath("$.hasFamilyMembers") { value(true) }
        }

        // 5. set-pin again is forbidden.
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"9999"}"""
        }.andExpect { status { isForbidden() } }

        // 6. Member creation now requires a session.
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Mama","role":"parent","color":"pink"}"""
        }.andExpect { status { isUnauthorized() } }

        // 7. With the token it works.
        val created = mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Mama","role":"parent","color":"pink"}"""
            header("X-Pin-Session", token)
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val memberId = objectMapper.readTree(created).get("id").asText()

        // 8. Avatar round-trip (upload with token, read publicly).
        mockMvc.put("/api/v1/members/$memberId/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = byteArrayOf(10, 20, 30)
            header("X-Pin-Session", token)
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/api/v1/members/$memberId/avatar").andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_JPEG) }
        }

        // 9. change-pin requires session; then old PIN fails, new PIN opens a session.
        mockMvc.post("/api/v1/settings/change-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPin":"1234","newPin":"5678"}"""
            header("X-Pin-Session", token)
        }.andExpect { status { isNoContent() } }

        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect { status { isUnauthorized() } }

        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"5678"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { exists() }
        }
    }
}
```

- [ ] **Step 2: Run the integration test**

Run: `cd backend && ./gradlew test --tests "com.familyhub.Schritt2FlowIntegrationTest"`
Expected: PASS (1 test exercising the whole flow).

- [ ] **Step 3: Run the full build with coverage gate**

Run: `cd backend && ./gradlew check`
Expected: BUILD SUCCESSFUL — all tests pass and Jacoco 90% line / 100% branch gate holds for `members`, `settings`, `pin` packages.

> If branch coverage fails, the report at `backend/build/reports/jacoco/test/html/index.html` shows the uncovered branch. Add a focused test case for it (do not lower the threshold).

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/kotlin/com/familyhub/Schritt2FlowIntegrationTest.kt
git commit -m "test(backend): end-to-end setup, PIN protection and avatar flow"
```

---

## Self-Review Notes (traceability)

- **V2/V3 migrations** → Tasks 1, 2. **Settings keys** seeded (`setup.completed`, `setup.step`) → Task 2; `pin` written at runtime → Task 7.
- **Family Members API** (list/create/update/delete/avatar) → Tasks 3, 9, 10. Public GET vs protected mutations → Task 10 annotations + Task 11 proof.
- **Settings & PIN API** (setup-status/set-pin/verify-pin/change-pin + setup-step gap-fill) → Tasks 3, 7, 8.
- **PIN session in-memory + 15-min timeout** → Task 5. **Interceptor + `X-Pin-Session`** → Task 6. **Setup-gated protection** → Task 6/11.
- **PIN never returned** — no endpoint or response model exposes it (verify: `MemberResponse`, `SetupStatusResponse`, `SessionTokenResponse` have no pin field).
- **Avatar as BYTEA, served as image/jpeg, 500 KB server cap** → Tasks 1, 9, 10.
- **OpenAPI single source** → Task 3; consumed by the frontend plan.
