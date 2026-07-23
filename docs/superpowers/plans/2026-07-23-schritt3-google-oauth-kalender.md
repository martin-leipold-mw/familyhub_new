# Stufe 3 — Google OAuth + Kalender-Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Familien können ihre Google-Konten verbinden; Kalender werden zweiseitig (lesen + schreiben) in einen lokalen Spiegel synchronisiert. Erreichbar über den erweiterten Setup-Wizard und die Einstellungen.

**Architecture:** Spring-Boot-Backend mit offizieller Google-Client-Library. OAuth-Authorization-Code-Flow mit State-Nonce (In-Memory, TTL) und PKCE. Tokens/Credentials AES-256-GCM-verschlüsselt in Postgres. Zentraler `GoogleTokenProvider` liefert gültige Access-Tokens. Scheduler + manueller Trigger synchronisieren Events inkrementell (Sync-Token, Vollsync bei HTTP 410). React-Frontend mit generiertem Orval-Client, erweiterter 7-Schritt-Wizard.

**Tech Stack:** Kotlin 2.0 / Spring Boot 3.3 / Java 21 / JPA / Flyway / PostgreSQL. Google `google-api-services-calendar`, `google-api-client`, `google-oauth-client`, `google-auth-library-oauth2-http`. Tests: JUnit5, MockK, springmockk, Testcontainers, WireMock. Frontend: React/TS/Vite, TanStack Query, Orval, Vitest, MSW, Playwright.

## Global Constraints

- **Java Toolchain 21**, Kotlin 2.0.21, Spring Boot 3.3.5 — exakt wie `backend/build.gradle.kts`.
- **JaCoCo-Gate: 90 % Line, 100 % Branch** (ausgenommen `**/config/**`, `**/security/**`, `**/generated/**`, `**/Application*`). Jede Verzweigung braucht einen Test.
- **OpenAPI-first:** neue Endpunkte zuerst in `api/openapi.yml`; Backend-Controller implementieren generierte Interfaces aus `com.familyhub.generated.api`, DTOs aus `com.familyhub.generated.model`. Frontend-Client via Orval regeneriert.
- **Controller-Pattern:** `@RestController @RequestMapping("/api")` + Implementierung des generierten Api-Interfaces; PIN-Schutz per `@RequiresPinSession` auf der Methode (greift nur bei `setup.completed=true`).
- **UI-Sprache Deutsch**, alle Nutzer-Strings deutsch. Event-Titel-Fallback „Ohne Titel".
- **Zeit:** Speicherung in UTC (`TIMESTAMPTZ` / `Instant`); anwendungsweite Zeitzone aus Setting `family.timezone` (Default `Europe/Berlin`).
- **Fehler:** niemals HTTP 500 auf Nutzereingabe; Fachfehler über bestehende `DomainExceptions` + `GlobalExceptionHandler`.
- **Verschlüsselung:** ein Schlüssel `FAMILYHUB_ENCRYPTION_KEY` (bereits vom `StartupValidator` geprüft) für Tokens und Credentials.
- **Migrationen** fortlaufend ab `V4`; `ddl-auto=none`, Flyway ist die einzige Quelle des Schemas.
- **Commits:** nach jeder Task; Prefix `feat(backend)`/`feat(frontend)`/`feat(api)`/`test(...)` wie in der Historie.

**Referenz-Spec:** `docs/superpowers/specs/2026-07-23-schritt3-google-oauth-kalender-design.md`

---

## Dateistruktur (Backend, neu)

```
com.familyhub.google
  crypto/EncryptionService.kt
  credentials/GoogleCredentials.kt, GoogleCredentialsRepository.kt,
              CredentialsService.kt, CredentialsController.kt
  oauth/RedirectUriNormalizer.kt, PkceGenerator.kt, OAuthStateStore.kt,
        GoogleOAuthFlow.kt, GoogleApiClientFactory.kt
  connection/GoogleConnection.kt, GoogleConnectionRepository.kt,
             ConnectionService.kt, GoogleAuthController.kt
  token/GoogleTokenProvider.kt
  calendar/CalendarSubscription.kt, CalendarSubscriptionRepository.kt,
           Event.kt, EventRepository.kt, GoogleCalendarClient.kt,
           EventMapper.kt, CalendarSyncService.kt, EventService.kt,
           CalendarController.kt, EventController.kt
  sync/CalendarSyncScheduler.kt
resources/db/migration/V4..V8__*.sql
```

Neue Domain-Exceptions ergänzen `shared/exceptions/DomainExceptions.kt`.

---

## Phase A — Fundament: Abhängigkeiten, Crypto, Migrationen

### Task 1: Google-Library- und Test-Abhängigkeiten

**Files:**
- Modify: `backend/build.gradle.kts` (dependencies-Block)

**Interfaces:**
- Produces: Klassen `com.google.api.services.calendar.Calendar`, `com.google.auth.oauth2.*`, `com.github.tomakehurst.wiremock.*` auf dem Classpath.

- [ ] **Step 1: Abhängigkeiten ergänzen**

In `backend/build.gradle.kts` im `dependencies { }`-Block nach den Spring-Boot-Zeilen einfügen:

```kotlin
    // Google APIs
    implementation("com.google.api-client:google-api-client:2.7.0")
    implementation("com.google.apis:google-api-services-calendar:v3-rev20241101-2.0.0")
    implementation("com.google.oauth-client:google-oauth-client:1.36.0")
    implementation("com.google.auth:google-auth-library-oauth2-http:1.28.0")
    implementation("com.google.http-client:google-http-client-jackson2:1.45.0")
```

Im Test-Block ergänzen:

```kotlin
    testImplementation("org.wiremock:wiremock-standalone:3.9.2")
```

- [ ] **Step 2: Auflösung prüfen**

Run: `cd backend && JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java)))) ./gradlew dependencies --configuration runtimeClasspath -q | grep -i "google-api-services-calendar"`
Expected: Zeile mit `google-api-services-calendar:v3-rev20241101-2.0.0`.
(Falls `./gradlew` mit „IllegalArgumentException: 25.0.3" bricht: JAVA_HOME auf ein **Java 21** setzen — siehe Memory `backend-requires-java-21`.)

- [ ] **Step 3: Commit**

```bash
git add backend/build.gradle.kts
git commit -m "build(backend): add Google API client and WireMock dependencies"
```

---

### Task 2: EncryptionService (AES-256-GCM)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/crypto/EncryptionService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/crypto/EncryptionServiceTest.kt`

**Interfaces:**
- Consumes: Setting `familyhub.security.encryption-key` (bereits in `application.yml`).
- Produces: `EncryptionService.encrypt(plaintext: String): String`, `decrypt(ciphertext: String): String`. Ausgabe `Base64(IV[12] ‖ Ciphertext ‖ Tag[16])`.

- [ ] **Step 1: Failing test schreiben**

`EncryptionServiceTest.kt`:

```kotlin
package com.familyhub.google.crypto

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class EncryptionServiceTest {

    private val service = EncryptionService("test-key-with-more-than-32-characters-in-it")

    @Test
    fun `round-trips a plaintext`() {
        val cipher = service.encrypt("hello-token")
        assertThat(cipher).isNotEqualTo("hello-token")
        assertThat(service.decrypt(cipher)).isEqualTo("hello-token")
    }

    @Test
    fun `produces a different ciphertext each call (random IV)`() {
        assertThat(service.encrypt("x")).isNotEqualTo(service.encrypt("x"))
    }

    @Test
    fun `derives a valid key from a short non-ASCII key string`() {
        val s = EncryptionService("schlüssel-äöü")
        assertThat(s.decrypt(s.encrypt("payload"))).isEqualTo("payload")
    }

    @Test
    fun `rejects tampered ciphertext`() {
        val cipher = service.encrypt("secret")
        val tampered = cipher.dropLast(4) + "AAAA"
        assertThatThrownBy { service.decrypt(tampered) }.isInstanceOf(Exception::class.java)
    }
}
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.crypto.EncryptionServiceTest"`
Expected: FAIL — `EncryptionService` existiert nicht.

- [ ] **Step 3: EncryptionService implementieren**

```kotlin
package com.familyhub.google.crypto

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@Service
class EncryptionService(
    @Value("\${familyhub.security.encryption-key}") rawKey: String,
) {
    private val key = SecretKeySpec(
        MessageDigest.getInstance("SHA-256").digest(rawKey.toByteArray(Charsets.UTF_8)),
        "AES",
    )
    private val random = SecureRandom()

    fun encrypt(plaintext: String): String {
        val iv = ByteArray(IV_LENGTH).also { random.nextBytes(it) }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(iv + encrypted)
    }

    fun decrypt(ciphertext: String): String {
        val bytes = Base64.getDecoder().decode(ciphertext)
        val iv = bytes.copyOfRange(0, IV_LENGTH)
        val body = bytes.copyOfRange(IV_LENGTH, bytes.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        return String(cipher.doFinal(body), Charsets.UTF_8)
    }

    companion object {
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_LENGTH = 12
        private const val TAG_BITS = 128
    }
}
```

- [ ] **Step 4: Test grün laufen lassen**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.crypto.EncryptionServiceTest"`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/crypto backend/src/test/kotlin/com/familyhub/google/crypto
git commit -m "feat(backend): add AES-256-GCM EncryptionService for tokens and credentials"
```

---

### Task 3: Migrationen V4–V8

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__google_credentials.sql`
- Create: `backend/src/main/resources/db/migration/V5__google_connections.sql`
- Create: `backend/src/main/resources/db/migration/V6__calendar_subscriptions.sql`
- Create: `backend/src/main/resources/db/migration/V7__events.sql`
- Create: `backend/src/main/resources/db/migration/V8__google_settings_keys.sql`
- Test: `backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt`

**Interfaces:**
- Produces: Tabellen `google_credentials`, `google_connections`, `calendar_subscriptions`, `events`; Settings-Keys `google.sync.interval.minutes`, `family.timezone`, `google.connected`.

- [ ] **Step 1: V4 schreiben**

```sql
-- V4: OAuth client credentials (one row = one Google Cloud project / OAuth client)
CREATE TABLE google_credentials (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     TEXT         NOT NULL,   -- AES-GCM encrypted, Base64
    client_secret TEXT         NOT NULL,   -- AES-GCM encrypted, Base64
    redirect_uri  VARCHAR(512) NOT NULL,
    nickname      VARCHAR(100) NOT NULL,
    is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_google_credentials_single_primary
    ON google_credentials (is_primary) WHERE is_primary = TRUE;
```

- [ ] **Step 2: V5 schreiben**

```sql
-- V5: Connected Google account per family member
CREATE TABLE google_connections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    credentials_id    UUID REFERENCES google_credentials(id) ON DELETE SET NULL,
    google_account_id VARCHAR(255) NOT NULL,
    email             VARCHAR(320) NOT NULL,
    access_token      TEXT,
    refresh_token     TEXT NOT NULL,
    token_expires_at  TIMESTAMP WITH TIME ZONE,
    scopes            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status            VARCHAR(20) NOT NULL DEFAULT 'active',
    connected_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_synced_at    TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX idx_google_connections_account ON google_connections (google_account_id);
CREATE INDEX idx_google_connections_member ON google_connections (family_member_id);
```

- [ ] **Step 3: V6 schreiben**

```sql
-- V6: Selectable calendars per connection + incremental sync token
CREATE TABLE calendar_subscriptions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id      UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
    google_calendar_id VARCHAR(255) NOT NULL,
    summary            VARCHAR(512) NOT NULL,
    background_color   VARCHAR(9),
    is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
    is_selected        BOOLEAN NOT NULL DEFAULT FALSE,
    sync_token         TEXT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, google_calendar_id)
);
```

- [ ] **Step 4: V7 schreiben**

```sql
-- V7: Local event mirror
CREATE TABLE events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id    UUID NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
    google_event_id    VARCHAR(1024) NOT NULL,
    google_calendar_id VARCHAR(255) NOT NULL,
    owner_member_id    UUID NOT NULL REFERENCES family_members(id),
    title              VARCHAR(1024) NOT NULL,
    description        TEXT,
    location           VARCHAR(1024),
    start_time         TIMESTAMP WITH TIME ZONE,
    end_time           TIMESTAMP WITH TIME ZONE,
    is_all_day         BOOLEAN NOT NULL DEFAULT FALSE,
    all_day_start      DATE,
    all_day_end        DATE,
    recurrence_id      VARCHAR(255),
    etag               VARCHAR(255),
    google_updated     TIMESTAMP WITH TIME ZONE,
    sync_status        VARCHAR(20) NOT NULL DEFAULT 'synced',
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (google_event_id, google_calendar_id)
);
CREATE INDEX idx_events_window ON events (start_time, end_time);
CREATE INDEX idx_events_owner ON events (owner_member_id);
```

- [ ] **Step 5: V8 schreiben**

```sql
-- V8: Google/calendar related settings defaults
INSERT INTO settings (key, value) VALUES ('google.sync.interval.minutes', '15');
INSERT INTO settings (key, value) VALUES ('family.timezone', 'Europe/Berlin');
INSERT INTO settings (key, value) VALUES ('google.connected', 'false');
```

- [ ] **Step 6: Smoke-Test schreiben**

`MigrationSmokeTest.kt` (nutzt das bestehende Testcontainers-Basismuster — siehe `93ed394`; verwende dieselbe abstrakte Basisklasse/Annotation wie bestehende Integrationstests):

```kotlin
package com.familyhub.google

import com.familyhub.AbstractIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate

class MigrationSmokeTest @Autowired constructor(
    private val jdbc: JdbcTemplate,
) : AbstractIntegrationTest() {

    @Test
    fun `google tables exist and settings seeded`() {
        val tables = jdbc.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
            String::class.java,
        )
        assertThat(tables).contains(
            "google_credentials", "google_connections", "calendar_subscriptions", "events",
        )
        val interval = jdbc.queryForObject(
            "SELECT value FROM settings WHERE key='google.sync.interval.minutes'", String::class.java,
        )
        assertThat(interval).isEqualTo("15")
    }
}
```

> Falls die bestehende Testbasisklasse anders heißt: `find backend/src/test -name "*IntegrationTest*"` und dieselbe Basis/Annotationen übernehmen.

- [ ] **Step 7: Test grün**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.MigrationSmokeTest"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt
git commit -m "feat(backend): add Flyway migrations V4-V8 for Google credentials, connections, calendars, events"
```

---

## Phase B — Credentials-Verwaltung

### Task 4: GoogleCredentials Entity + Repository

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/credentials/GoogleCredentials.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/credentials/GoogleCredentialsRepository.kt`

**Interfaces:**
- Produces: Entity `GoogleCredentials` (Felder `clientId`, `clientSecret` [verschlüsselt gespeichert], `redirectUri`, `nickname`, `isPrimary`, `isActive`, `id`, timestamps). Repo `GoogleCredentialsRepository : JpaRepository<GoogleCredentials, UUID>` mit `findByIsPrimaryTrue(): GoogleCredentials?`, `findAllByIsActiveTrue(): List<GoogleCredentials>`.

- [ ] **Step 1: Entity + Repo schreiben** (kein separater Unit-Test; über Service-Tests in Task 6 abgedeckt)

`GoogleCredentials.kt` (Muster wie `FamilyMember.kt`, `@PrePersist`/`@PreUpdate` für Timestamps):

```kotlin
package com.familyhub.google.credentials

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "google_credentials")
class GoogleCredentials(
    @Column(name = "client_id", nullable = false) var clientId: String,       // encrypted
    @Column(name = "client_secret", nullable = false) var clientSecret: String, // encrypted
    @Column(name = "redirect_uri", nullable = false) var redirectUri: String,
    @Column(nullable = false) var nickname: String,
    @Column(name = "is_primary", nullable = false) var isPrimary: Boolean = false,
    @Column(name = "is_active", nullable = false) var isActive: Boolean = true,
) {
    @Id @GeneratedValue(strategy = GenerationType.UUID) var id: UUID? = null
    @Column(name = "created_at", updatable = false) var createdAt: Instant? = null
    @Column(name = "updated_at") var updatedAt: Instant? = null

    @PrePersist protected fun onCreate() { val n = Instant.now(); createdAt = n; updatedAt = n }
    @PreUpdate protected fun onUpdate() { updatedAt = Instant.now() }
}
```

`GoogleCredentialsRepository.kt`:

```kotlin
package com.familyhub.google.credentials

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface GoogleCredentialsRepository : JpaRepository<GoogleCredentials, UUID> {
    fun findByIsPrimaryTrue(): GoogleCredentials?
    fun findAllByIsActiveTrue(): List<GoogleCredentials>
}
```

- [ ] **Step 2: Kompiliert**

Run: `cd backend && ./gradlew compileKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/credentials
git commit -m "feat(backend): add GoogleCredentials entity and repository"
```

---

### Task 5: RedirectUriNormalizer

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/oauth/RedirectUriNormalizer.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/RedirectUriNormalizerTest.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt` (falls `ValidationException` noch nicht existiert — sie existiert bereits aus Stufe 2; wiederverwenden)

**Interfaces:**
- Produces: `RedirectUriNormalizer.normalize(uri: String): String` — lowercased scheme+host, ohne Fragment/Userinfo; wirft `ValidationException` bei leerem/kaputtem URI oder `http` auf Nicht-localhost.

- [ ] **Step 1: Failing test**

```kotlin
package com.familyhub.google.oauth

import com.familyhub.shared.exceptions.ValidationException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class RedirectUriNormalizerTest {
    private val n = RedirectUriNormalizer()

    @Test fun `keeps a valid localhost http uri`() {
        assertThat(n.normalize("http://localhost:8080/oauth/callback"))
            .isEqualTo("http://localhost:8080/oauth/callback")
    }

    @Test fun `lowercases scheme and host, strips fragment`() {
        assertThat(n.normalize("HTTPS://FamilyHub.Example.com/oauth/callback#frag"))
            .isEqualTo("https://familyhub.example.com/oauth/callback")
    }

    @Test fun `rejects http on non-localhost host`() {
        assertThatThrownBy { n.normalize("http://familyhub.example.com/oauth/callback") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects blank`() {
        assertThatThrownBy { n.normalize("  ") }.isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects malformed uri`() {
        assertThatThrownBy { n.normalize("not a uri") }.isInstanceOf(ValidationException::class.java)
    }
}
```

- [ ] **Step 2: Rot**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.RedirectUriNormalizerTest"`
Expected: FAIL.

- [ ] **Step 3: Implementieren**

```kotlin
package com.familyhub.google.oauth

import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Component
import java.net.URI

@Component
class RedirectUriNormalizer {
    fun normalize(uri: String): String {
        val trimmed = uri.trim()
        if (trimmed.isEmpty()) throw ValidationException("Redirect-URI ist erforderlich")
        val parsed = try {
            URI(trimmed)
        } catch (ex: Exception) {
            throw ValidationException("Redirect-URI ist ungültig")
        }
        val scheme = parsed.scheme?.lowercase()
            ?: throw ValidationException("Redirect-URI ist ungültig")
        val host = parsed.host?.lowercase()
            ?: throw ValidationException("Redirect-URI ist ungültig")
        val isLocalhost = host == "localhost" || host == "127.0.0.1"
        if (scheme == "http" && !isLocalhost) {
            throw ValidationException("Redirect-URI muss https verwenden (außer localhost)")
        }
        if (scheme != "http" && scheme != "https") {
            throw ValidationException("Redirect-URI muss http oder https sein")
        }
        val port = if (parsed.port != -1) ":${parsed.port}" else ""
        val path = parsed.path ?: ""
        return "$scheme://$host$port$path"
    }
}
```

- [ ] **Step 4: Grün**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.RedirectUriNormalizerTest"`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth/RedirectUriNormalizer.kt backend/src/test/kotlin/com/familyhub/google/oauth/RedirectUriNormalizerTest.kt
git commit -m "feat(backend): add RedirectUriNormalizer with https-enforcement"
```

---

### Task 6: CredentialsService (CRUD + Primary + Validate)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/credentials/CredentialsService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/credentials/CredentialsServiceTest.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt` (neue `ResourceNotFoundException`, falls nicht vorhanden — prüfen, sonst bestehende nutzen)

**Interfaces:**
- Consumes: `GoogleCredentialsRepository`, `EncryptionService`, `RedirectUriNormalizer`, `GoogleOAuthFlow` (Task 10, für `validate`). **Reihenfolge-Hinweis:** `validate()` in Task 6 zunächst gegen ein Interface `TokenEndpointProber` mit `probe(clientId, clientSecret, redirectUri): ProbeResult` schreiben; die echte Implementierung liefert Task 10 nach. So bleibt Task 6 unabhängig testbar.
- Produces: `CredentialsService` mit
  `create(req): GoogleCredentialsView`, `list(): List<GoogleCredentialsView>`, `get(id): GoogleCredentialsView`, `update(id, req): GoogleCredentialsView`, `delete(id)`, `setPrimary(id): GoogleCredentialsView`, `validate(clientId, clientSecret, redirectUri): ValidationResult`.
  `GoogleCredentialsView(id, nickname, redirectUri, isPrimary, isActive, createdAt)` — **ohne** clientId/clientSecret im Klartext.
  Interner Zugriff `decryptedClientId(entity)`, `decryptedClientSecret(entity)` für den OAuth-Flow.

- [ ] **Step 1: Failing test** (Auszug — vollständige Datei anlegen)

```kotlin
package com.familyhub.google.credentials

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.RedirectUriNormalizer
import com.familyhub.google.oauth.TokenEndpointProber
import com.familyhub.google.oauth.ProbeResult
import com.familyhub.shared.exceptions.ResourceNotFoundException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class CredentialsServiceTest {
    private val repo = mockk<GoogleCredentialsRepository>(relaxed = true)
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val normalizer = RedirectUriNormalizer()
    private val prober = mockk<TokenEndpointProber>()
    private lateinit var service: CredentialsService

    @BeforeEach fun setup() { service = CredentialsService(repo, enc, normalizer, prober) }

    @Test fun `create encrypts secrets and never returns them`() {
        val saved = slot<GoogleCredentials>()
        every { repo.save(capture(saved)) } answers { saved.captured.also { it.id = UUID.randomUUID() } }
        val view = service.create(newRequest())
        assertThat(saved.captured.clientId).isNotEqualTo("cid.apps.googleusercontent.com")
        assertThat(enc.decrypt(saved.captured.clientId)).isEqualTo("cid.apps.googleusercontent.com")
        // View exposes no secret
        assertThat(view.nickname).isEqualTo("Familie")
    }

    @Test fun `setPrimary demotes the previous primary`() {
        val old = existing(isPrimary = true)
        val target = existing(isPrimary = false)
        every { repo.findByIsPrimaryTrue() } returns old
        every { repo.findById(target.id!!) } returns Optional.of(target)
        every { repo.save(any()) } answers { firstArg() }
        service.setPrimary(target.id!!)
        assertThat(old.isPrimary).isFalse()
        assertThat(target.isPrimary).isTrue()
    }

    @Test fun `get throws when missing`() {
        every { repo.findById(any()) } returns Optional.empty()
        assertThatThrownBy { service.get(UUID.randomUUID()) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test fun `validate maps invalid_grant to success`() {
        every { prober.probe(any(), any(), any()) } returns ProbeResult.CREDENTIALS_VALID
        val r = service.validate("cid.apps.googleusercontent.com", "sec", "http://localhost:8080/oauth/callback")
        assertThat(r.isValid).isTrue()
    }

    @Test fun `validate maps invalid_client to failure`() {
        every { prober.probe(any(), any(), any()) } returns ProbeResult.CLIENT_INVALID
        val r = service.validate("cid.apps.googleusercontent.com", "sec", "http://localhost:8080/oauth/callback")
        assertThat(r.isValid).isFalse()
    }

    private fun newRequest() = CredentialsCommand(
        nickname = "Familie", clientId = "cid.apps.googleusercontent.com",
        clientSecret = "GOCSPX-secret", redirectUri = "http://localhost:8080/oauth/callback",
    )
    private fun existing(isPrimary: Boolean) = GoogleCredentials(
        clientId = enc.encrypt("cid"), clientSecret = enc.encrypt("sec"),
        redirectUri = "http://localhost:8080/oauth/callback", nickname = "N", isPrimary = isPrimary,
    ).also { it.id = UUID.randomUUID() }
}
```

- [ ] **Step 2: Rot**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.credentials.CredentialsServiceTest"`
Expected: FAIL — `CredentialsService`, `CredentialsCommand`, `TokenEndpointProber`, `ProbeResult` fehlen.

- [ ] **Step 3: Prober-Interface, Command/View/Result und Service anlegen**

`backend/src/main/kotlin/com/familyhub/google/oauth/TokenEndpointProber.kt`:

```kotlin
package com.familyhub.google.oauth

enum class ProbeResult { CREDENTIALS_VALID, CLIENT_INVALID, ERROR }

interface TokenEndpointProber {
    /** Ruft den Google-Token-Endpoint mit einem absichtlich ungültigen Code auf. */
    fun probe(clientId: String, clientSecret: String, redirectUri: String): ProbeResult
}
```

`CredentialsService.kt`:

```kotlin
package com.familyhub.google.credentials

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.ProbeResult
import com.familyhub.google.oauth.RedirectUriNormalizer
import com.familyhub.google.oauth.TokenEndpointProber
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

data class CredentialsCommand(
    val nickname: String, val clientId: String,
    val clientSecret: String, val redirectUri: String,
)
data class GoogleCredentialsView(
    val id: UUID, val nickname: String, val redirectUri: String,
    val isPrimary: Boolean, val isActive: Boolean, val createdAt: Instant?,
)
data class ValidationResult(val isValid: Boolean, val message: String)

@Service
class CredentialsService(
    private val repo: GoogleCredentialsRepository,
    private val encryption: EncryptionService,
    private val normalizer: RedirectUriNormalizer,
    private val prober: TokenEndpointProber,
) {
    @Transactional
    fun create(cmd: CredentialsCommand): GoogleCredentialsView {
        val entity = GoogleCredentials(
            clientId = encryption.encrypt(cmd.clientId.trim()),
            clientSecret = encryption.encrypt(cmd.clientSecret.trim()),
            redirectUri = normalizer.normalize(cmd.redirectUri),
            nickname = cmd.nickname.trim(),
            isPrimary = repo.findByIsPrimaryTrue() == null, // first one becomes primary
        )
        return repo.save(entity).toView()
    }

    fun list(): List<GoogleCredentialsView> = repo.findAll().map { it.toView() }

    fun get(id: UUID): GoogleCredentialsView = load(id).toView()

    @Transactional
    fun update(id: UUID, cmd: CredentialsCommand): GoogleCredentialsView {
        val e = load(id)
        e.nickname = cmd.nickname.trim()
        e.redirectUri = normalizer.normalize(cmd.redirectUri)
        if (cmd.clientId.isNotBlank()) e.clientId = encryption.encrypt(cmd.clientId.trim())
        if (cmd.clientSecret.isNotBlank()) e.clientSecret = encryption.encrypt(cmd.clientSecret.trim())
        return repo.save(e).toView()
    }

    @Transactional
    fun delete(id: UUID) = repo.delete(load(id))

    @Transactional
    fun setPrimary(id: UUID): GoogleCredentialsView {
        val target = load(id)
        repo.findByIsPrimaryTrue()?.let { if (it.id != target.id) { it.isPrimary = false; repo.save(it) } }
        target.isPrimary = true
        return repo.save(target).toView()
    }

    fun validate(clientId: String, clientSecret: String, redirectUri: String): ValidationResult =
        when (prober.probe(clientId.trim(), clientSecret.trim(), normalizer.normalize(redirectUri))) {
            ProbeResult.CREDENTIALS_VALID -> ValidationResult(true, "Verbindung erfolgreich!")
            ProbeResult.CLIENT_INVALID -> ValidationResult(false, "Client-ID oder Secret ist ungültig.")
            ProbeResult.ERROR -> ValidationResult(false, "Verbindung zu Google fehlgeschlagen.")
        }

    // Internal — for the OAuth flow only
    fun decryptedClientId(id: UUID): String = encryption.decrypt(load(id).clientId)
    fun entity(id: UUID): GoogleCredentials = load(id)
    fun primaryOrNull(): GoogleCredentials? = repo.findByIsPrimaryTrue()

    private fun load(id: UUID): GoogleCredentials =
        repo.findById(id).orElseThrow { ResourceNotFoundException("Google-Credentials nicht gefunden") }

    private fun GoogleCredentials.toView() =
        GoogleCredentialsView(id!!, nickname, redirectUri, isPrimary, isActive, createdAt)
}
```

Falls `ResourceNotFoundException` in `DomainExceptions.kt` fehlt, ergänzen (Muster der bestehenden Exceptions, gemappt auf HTTP 404 im `GlobalExceptionHandler`).

- [ ] **Step 4: Grün**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.credentials.CredentialsServiceTest"`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google backend/src/test/kotlin/com/familyhub/google/credentials
git commit -m "feat(backend): add CredentialsService with encryption, primary handling and validation"
```

---

### Task 7: OpenAPI + CredentialsController

**Files:**
- Modify: `api/openapi.yml` (Tag `GoogleCredentials`, Pfade `/v1/google/credentials`, `/v1/google/credentials/{id}`, `/v1/google/credentials/{id}/primary`, `/v1/google/credentials/validate`; Schemas `GoogleCredentialsRequest`, `GoogleCredentialsResponse`, `CredentialsValidationRequest`, `CredentialsValidationResponse`)
- Create: `backend/src/main/kotlin/com/familyhub/google/credentials/CredentialsController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/credentials/CredentialsControllerTest.kt` (`@WebMvcTest`)

**Interfaces:**
- Consumes: generierte `GoogleCredentialsApi`, DTOs `GoogleCredentialsRequest/Response`, `CredentialsValidationRequest/Response`, `CredentialsService`.
- Produces: REST unter `/api/v1/google/credentials`.

- [ ] **Step 1: OpenAPI-Pfade + Schemas ergänzen**

In `api/openapi.yml` unter `tags:` ergänzen `- name: GoogleCredentials`. Pfade hinzufügen (Muster wie `/v1/members`; **`security: []`** setzen, PIN-Schutz erfolgt serverseitig per Annotation). Response `GoogleCredentialsResponse` enthält `id, nickname, redirectUri, isPrimary, isActive, createdAt` — **kein** clientId/clientSecret. `GoogleCredentialsRequest`: `nickname, clientId, clientSecret, redirectUri` (bei PUT clientId/clientSecret optional/leer erlaubt). `POST /validate` nutzt `CredentialsValidationRequest {clientId, clientSecret, redirectUri}` → `CredentialsValidationResponse {isValid, message}`. `POST /` → 201, `DELETE /{id}` → 204, `PUT /{id}/primary` → 200.

- [ ] **Step 2: Generierung + Rot**

Run: `cd backend && ./gradlew openApiGenerate && ./gradlew compileKotlin`
Expected: Interface `com.familyhub.generated.api.GoogleCredentialsApi` erzeugt; Compile schlägt fehl, weil `CredentialsController` noch nicht existiert (bzw. Test rot).

- [ ] **Step 3: Controller implementieren**

```kotlin
package com.familyhub.google.credentials

import com.familyhub.generated.api.GoogleCredentialsApi
import com.familyhub.generated.model.*
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class CredentialsController(
    private val service: CredentialsService,
) : GoogleCredentialsApi {

    @RequiresPinSession
    override fun listCredentials(): ResponseEntity<List<GoogleCredentialsResponse>> =
        ResponseEntity.ok(service.list().map { it.toResponse() })

    @RequiresPinSession
    override fun createCredentials(req: GoogleCredentialsRequest): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(service.create(req.toCommand()).toResponse())

    @RequiresPinSession
    override fun getCredentials(id: UUID): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.ok(service.get(id).toResponse())

    @RequiresPinSession
    override fun updateCredentials(id: UUID, req: GoogleCredentialsRequest): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.ok(service.update(id, req.toCommand()).toResponse())

    @RequiresPinSession
    override fun deleteCredentials(id: UUID): ResponseEntity<Unit> {
        service.delete(id); return ResponseEntity.noContent().build()
    }

    @RequiresPinSession
    override fun setPrimaryCredentials(id: UUID): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.ok(service.setPrimary(id).toResponse())

    @RequiresPinSession
    override fun validateCredentials(req: CredentialsValidationRequest): ResponseEntity<CredentialsValidationResponse> {
        val r = service.validate(req.clientId, req.clientSecret, req.redirectUri)
        return ResponseEntity.ok(CredentialsValidationResponse(isValid = r.isValid, message = r.message))
    }

    private fun GoogleCredentialsRequest.toCommand() =
        CredentialsCommand(nickname, clientId ?: "", clientSecret ?: "", redirectUri)
    private fun GoogleCredentialsView.toResponse() =
        GoogleCredentialsResponse(
            id = id, nickname = nickname, redirectUri = redirectUri,
            isPrimary = isPrimary, isActive = isActive,
        )
}
```

> Feldnamen ggf. an die tatsächlich generierten DTO-Properties anpassen (Nullbarkeit von `clientId`/`clientSecret` in `GoogleCredentialsRequest`).

- [ ] **Step 4: Controller-Test schreiben** (`@WebMvcTest(CredentialsController::class)`, Service via `@MockkBean`; Muster wie bestehender `MembersControllerTest`)

Mindestens: POST → 201 + kein Secret im Body; GET list → 200; validate → 200 mit `isValid`. (Auth ist im `@WebMvcTest`-Slice nicht aktiv — siehe `InterceptorConfig`-Kommentar; PIN-Enforcement wird im E2E-Test in Task 26 geprüft.)

- [ ] **Step 5: Grün**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.credentials.CredentialsControllerTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/openapi.yml backend/src/main/kotlin/com/familyhub/google/credentials/CredentialsController.kt backend/src/test/kotlin/com/familyhub/google/credentials/CredentialsControllerTest.kt
git commit -m "feat(api): add Google credentials endpoints and controller"
```

---

## Phase C — OAuth-Flow

### Task 8: PkceGenerator + OAuthStateStore

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/oauth/PkceGenerator.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/oauth/OAuthStateStore.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/PkceGeneratorTest.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/OAuthStateStoreTest.kt`

**Interfaces:**
- Produces:
  `PkceGenerator.generateVerifier(): String` (43–128 base64url-Zeichen), `challengeFor(verifier): String` (S256, base64url ohne Padding).
  `OAuthStateStore.create(credentialsId: UUID?, returnUrl: String, verifier: String): String` (gibt Nonce), `consume(state: String): OAuthStateEntry?` (einmalig, `null` bei fehlend/abgelaufen). `OAuthStateEntry(credentialsId, returnUrl, verifier)`. TTL über injizierbaren `Clock`.

- [ ] **Step 1: PKCE-Test**

```kotlin
package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import java.util.Base64

class PkceGeneratorTest {
    private val g = PkceGenerator()

    @Test fun `verifier has valid length and charset`() {
        val v = g.generateVerifier()
        assertThat(v.length).isBetween(43, 128)
        assertThat(v).matches("[A-Za-z0-9_-]+")
    }

    @Test fun `challenge is base64url sha256 of verifier without padding`() {
        val v = "test-verifier-value"
        val expected = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(v.toByteArray()))
        assertThat(g.challengeFor(v)).isEqualTo(expected)
    }
}
```

- [ ] **Step 2: State-Store-Test**

```kotlin
package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class OAuthStateStoreTest {
    private val fixed = Instant.parse("2026-07-23T10:00:00Z")

    @Test fun `create then consume returns the entry once`() {
        val store = OAuthStateStore(Clock.fixed(fixed, ZoneOffset.UTC))
        val id = UUID.randomUUID()
        val state = store.create(id, "/setup", "verifier")
        val e = store.consume(state)
        assertThat(e).isNotNull
        assertThat(e!!.credentialsId).isEqualTo(id)
        assertThat(e.returnUrl).isEqualTo("/setup")
        assertThat(store.consume(state)).isNull() // single-use
    }

    @Test fun `consume returns null for unknown state`() {
        val store = OAuthStateStore(Clock.fixed(fixed, ZoneOffset.UTC))
        assertThat(store.consume("nope")).isNull()
    }

    @Test fun `consume returns null after TTL`() {
        val clock = MutableClock(fixed)
        val store = OAuthStateStore(clock)
        val state = store.create(null, "/", "v")
        clock.advance(Duration.ofMinutes(11))
        assertThat(store.consume(state)).isNull()
    }

    private class MutableClock(var now: Instant) : Clock() {
        fun advance(d: Duration) { now = now.plus(d) }
        override fun instant() = now
        override fun getZone() = ZoneOffset.UTC
        override fun withZone(z: java.time.ZoneId?) = this
    }
}
```

- [ ] **Step 3: Rot**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.PkceGeneratorTest" --tests "com.familyhub.google.oauth.OAuthStateStoreTest"`
Expected: FAIL.

- [ ] **Step 4: Implementieren**

`PkceGenerator.kt`:

```kotlin
package com.familyhub.google.oauth

import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

@Component
class PkceGenerator {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun generateVerifier(): String =
        encoder.encodeToString(ByteArray(48).also { random.nextBytes(it) }) // 64 chars

    fun challengeFor(verifier: String): String =
        encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
}
```

`OAuthStateStore.kt`:

```kotlin
package com.familyhub.google.oauth

import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class OAuthStateEntry(val credentialsId: UUID?, val returnUrl: String, val verifier: String)

@Component
class OAuthStateStore(private val clock: Clock) {
    private data class Stored(val entry: OAuthStateEntry, val createdAt: Instant)
    private val store = ConcurrentHashMap<String, Stored>()
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun create(credentialsId: UUID?, returnUrl: String, verifier: String): String {
        val nonce = encoder.encodeToString(ByteArray(24).also { random.nextBytes(it) })
        store[nonce] = Stored(OAuthStateEntry(credentialsId, returnUrl, verifier), clock.instant())
        return nonce
    }

    fun consume(state: String): OAuthStateEntry? {
        val stored = store.remove(state) ?: return null
        if (Duration.between(stored.createdAt, clock.instant()) > TTL) return null
        return stored.entry
    }

    companion object { private val TTL = Duration.ofMinutes(10) }
}
```

> Ein `Clock`-Bean existiert bereits (`shared/config/ClockConfig.kt`). Falls es dort keinen gibt: Bean ergänzen.

- [ ] **Step 5: Grün**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.PkceGeneratorTest" --tests "com.familyhub.google.oauth.OAuthStateStoreTest"`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth/PkceGenerator.kt backend/src/main/kotlin/com/familyhub/google/oauth/OAuthStateStore.kt backend/src/test/kotlin/com/familyhub/google/oauth
git commit -m "feat(backend): add PKCE generator and single-use OAuth state store"
```

---

### Task 9: GoogleConnection Entity + Repository

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/connection/GoogleConnection.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/connection/GoogleConnectionRepository.kt`

**Interfaces:**
- Produces: Entity `GoogleConnection` (`familyMemberId: UUID`, `credentialsId: UUID?`, `googleAccountId`, `email`, `accessToken: String?`, `refreshToken: String`, `tokenExpiresAt: Instant?`, `scopes: List<String>` [JSONB], `status: String`, `connectedAt`, `lastSyncedAt: Instant?`). Repo mit `findByGoogleAccountId(id): GoogleConnection?`, `findByFamilyMemberId(id): GoogleConnection?`, `findAllByStatus(status): List<GoogleConnection>`.

- [ ] **Step 1: Entity + Repo schreiben** (JSONB-Mapping via Hibernate `@JdbcTypeCode(SqlTypes.JSON)` auf `List<String>`)

```kotlin
package com.familyhub.google.connection

import jakarta.persistence.*
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "google_connections")
class GoogleConnection(
    @Column(name = "family_member_id", nullable = false) var familyMemberId: UUID,
    @Column(name = "credentials_id") var credentialsId: UUID?,
    @Column(name = "google_account_id", nullable = false) var googleAccountId: String,
    @Column(nullable = false) var email: String,
    @Column(name = "access_token") var accessToken: String?,        // encrypted
    @Column(name = "refresh_token", nullable = false) var refreshToken: String, // encrypted
    @Column(name = "token_expires_at") var tokenExpiresAt: Instant?,
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb")
    var scopes: List<String> = emptyList(),
    @Column(nullable = false) var status: String = "active",
    @Column(name = "last_synced_at") var lastSyncedAt: Instant? = null,
) {
    @Id @GeneratedValue(strategy = GenerationType.UUID) var id: UUID? = null
    @Column(name = "connected_at", updatable = false) var connectedAt: Instant? = null
    @PrePersist protected fun onCreate() { connectedAt = Instant.now() }
}
```

```kotlin
package com.familyhub.google.connection

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface GoogleConnectionRepository : JpaRepository<GoogleConnection, UUID> {
    fun findByGoogleAccountId(googleAccountId: String): GoogleConnection?
    fun findByFamilyMemberId(familyMemberId: UUID): GoogleConnection?
    fun findAllByStatus(status: String): List<GoogleConnection>
}
```

- [ ] **Step 2: Kompiliert** — `cd backend && ./gradlew compileKotlin` → SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/connection
git commit -m "feat(backend): add GoogleConnection entity and repository"
```

---

### Task 10: GoogleOAuthFlow + GoogleApiClientFactory + TokenEndpointProber-Impl

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/oauth/GoogleApiClientFactory.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt` (WireMock als Token/UserInfo-Stub)

**Interfaces:**
- Consumes: Google-Library, `PkceGenerator`, `RedirectUriNormalizer`. Token-/UserInfo-Basis-URLs als Konstruktorparameter (default Google, im Test WireMock-URL).
- Produces:
  `GoogleOAuthFlow.buildAuthorizationUrl(clientId, redirectUri, state, codeChallenge): String`
  `exchangeCode(clientId, clientSecret, redirectUri, code, verifier): GoogleTokenSet`
  `refresh(clientId, clientSecret, refreshToken): GoogleTokenSet`
  `fetchUserInfo(accessToken): GoogleUserInfo`
  `revoke(token)`
  Data: `GoogleTokenSet(accessToken, refreshToken: String?, expiresInSeconds: Long, scope: String?)`, `GoogleUserInfo(sub, email, name, picture)`.
  Zusätzlich implementiert diese Klasse (oder eine Nachbarklasse) `TokenEndpointProber` (Task 6).

- [ ] **Step 1: Failing test mit WireMock**

Test stubbt `POST /token` und `GET /userinfo`. Prüft: `buildAuthorizationUrl` enthält `code_challenge`, `code_challenge_method=S256`, `access_type=offline`, `prompt=consent`, `state`; `exchangeCode` parst `access_token`/`refresh_token`/`expires_in`; `probe` mappt `{"error":"invalid_grant"}` → `CREDENTIALS_VALID`, `{"error":"invalid_client"}` → `CLIENT_INVALID`.

```kotlin
package com.familyhub.google.oauth

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.*
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*

class GoogleOAuthFlowTest {
    private lateinit var wm: WireMockServer
    private lateinit var flow: GoogleOAuthFlow

    @BeforeEach fun start() {
        wm = WireMockServer(options().dynamicPort()); wm.start()
        flow = GoogleOAuthFlow(
            PkceGenerator(),
            tokenUrl = "${wm.baseUrl()}/token",
            userInfoUrl = "${wm.baseUrl()}/userinfo",
            revokeUrl = "${wm.baseUrl()}/revoke",
            authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth",
        )
    }
    @AfterEach fun stop() = wm.stop()

    @Test fun `authorization url carries pkce and offline params`() {
        val url = flow.buildAuthorizationUrl("cid", "http://localhost:8080/oauth/callback", "state123", "challengeXYZ")
        assertThat(url).contains("code_challenge=challengeXYZ", "code_challenge_method=S256",
            "access_type=offline", "prompt=consent", "state=state123", "client_id=cid")
    }

    @Test fun `exchangeCode parses tokens`() {
        wm.stubFor(post("/token").willReturn(okJson(
            """{"access_token":"AT","refresh_token":"RT","expires_in":3600,"token_type":"Bearer","scope":"a b"}""")))
        val set = flow.exchangeCode("cid", "sec", "http://localhost:8080/oauth/callback", "code", "verifier")
        assertThat(set.accessToken).isEqualTo("AT")
        assertThat(set.refreshToken).isEqualTo("RT")
        assertThat(set.expiresInSeconds).isEqualTo(3600)
    }

    @Test fun `probe maps invalid_grant to CREDENTIALS_VALID`() {
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(400)
            .withHeader("Content-Type","application/json").withBody("""{"error":"invalid_grant"}""")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.CREDENTIALS_VALID)
    }

    @Test fun `probe maps invalid_client to CLIENT_INVALID`() {
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(401)
            .withHeader("Content-Type","application/json").withBody("""{"error":"invalid_client"}""")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.CLIENT_INVALID)
    }

    @Test fun `fetchUserInfo parses profile`() {
        wm.stubFor(get("/userinfo").willReturn(okJson(
            """{"sub":"123","email":"a@b.de","name":"Papa","picture":"http://p"}""")))
        val u = flow.fetchUserInfo("AT")
        assertThat(u.sub).isEqualTo("123"); assertThat(u.email).isEqualTo("a@b.de")
    }
}
```

- [ ] **Step 2: Rot** — `./gradlew test --tests "...GoogleOAuthFlowTest"` → FAIL.

- [ ] **Step 3: Implementieren**

`GoogleApiClientFactory.kt` liefert einen konfigurierten `NetHttpTransport` mit Timeouts (Connect 5 s / Read 30 s) und `GsonFactory`. `GoogleOAuthFlow.kt`:

```kotlin
package com.familyhub.google.oauth

import com.google.api.client.auth.oauth2.*
import com.google.api.client.http.*
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.util.UriComponentsBuilder

data class GoogleTokenSet(val accessToken: String, val refreshToken: String?, val expiresInSeconds: Long, val scope: String?)
data class GoogleUserInfo(val sub: String, val email: String, val name: String?, val picture: String?)

@Component
class GoogleOAuthFlow(
    private val pkce: PkceGenerator,
    @Value("\${google.token-url:https://oauth2.googleapis.com/token}") private val tokenUrl: String,
    @Value("\${google.userinfo-url:https://www.googleapis.com/oauth2/v2/userinfo}") private val userInfoUrl: String,
    @Value("\${google.revoke-url:https://oauth2.googleapis.com/revoke}") private val revokeUrl: String,
    @Value("\${google.authorize-url:https://accounts.google.com/o/oauth2/v2/auth}") private val authorizeUrl: String,
) : TokenEndpointProber {
    private val transport = NetHttpTransport()
    private val json = GsonFactory.getDefaultInstance()
    private val scopes = listOf(
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
    )

    fun buildAuthorizationUrl(clientId: String, redirectUri: String, state: String, codeChallenge: String): String =
        UriComponentsBuilder.fromUriString(authorizeUrl)
            .queryParam("client_id", clientId)
            .queryParam("redirect_uri", redirectUri)
            .queryParam("response_type", "code")
            .queryParam("scope", scopes.joinToString(" "))
            .queryParam("access_type", "offline")
            .queryParam("prompt", "consent")
            .queryParam("code_challenge", codeChallenge)
            .queryParam("code_challenge_method", "S256")
            .queryParam("state", state)
            .build().encode().toUriString()

    fun exchangeCode(clientId: String, clientSecret: String, redirectUri: String, code: String, verifier: String): GoogleTokenSet {
        val req = AuthorizationCodeTokenRequest(transport, json, GenericUrl(tokenUrl), code)
            .setRedirectUri(redirectUri)
            .setClientAuthentication(ClientParametersAuthentication(clientId, clientSecret))
        req["code_verifier"] = verifier
        val resp = req.execute()
        return GoogleTokenSet(resp.accessToken, resp.refreshToken, resp.expiresInSeconds, resp.scope)
    }

    fun refresh(clientId: String, clientSecret: String, refreshToken: String): GoogleTokenSet {
        val resp = RefreshTokenRequest(transport, json, GenericUrl(tokenUrl), refreshToken)
            .setClientAuthentication(ClientParametersAuthentication(clientId, clientSecret))
            .execute()
        return GoogleTokenSet(resp.accessToken, resp.refreshToken, resp.expiresInSeconds, resp.scope)
    }

    fun fetchUserInfo(accessToken: String): GoogleUserInfo {
        val request = transport.createRequestFactory().buildGetRequest(GenericUrl(userInfoUrl))
        request.headers.authorization = "Bearer $accessToken"
        val body = request.execute().parseAsString()
        val map = json.createJsonParser(body).parse(Map::class.java)
        return GoogleUserInfo(
            sub = map["id"]?.toString() ?: map["sub"].toString(),
            email = map["email"].toString(),
            name = map["name"]?.toString(),
            picture = map["picture"]?.toString(),
        )
    }

    fun revoke(token: String) {
        try {
            transport.createRequestFactory()
                .buildPostRequest(GenericUrl("$revokeUrl?token=$token"), null).execute()
        } catch (ex: Exception) { /* best-effort: local disconnect proceeds regardless */ }
    }

    override fun probe(clientId: String, clientSecret: String, redirectUri: String): ProbeResult {
        return try {
            exchangeCode(clientId, clientSecret, redirectUri, "invalid-probe-code", pkce.generateVerifier())
            ProbeResult.CREDENTIALS_VALID // unexpected success also means creds are fine
        } catch (ex: TokenResponseException) {
            when (ex.details?.error) {
                "invalid_grant" -> ProbeResult.CREDENTIALS_VALID
                "invalid_client" -> ProbeResult.CLIENT_INVALID
                else -> ProbeResult.ERROR
            }
        } catch (ex: Exception) { ProbeResult.ERROR }
    }
}
```

> Präzise API-Klassen (`AuthorizationCodeTokenRequest`, `RefreshTokenRequest`, `ClientParametersAuthentication`, `TokenResponseException`) stammen aus `com.google.api.client.auth.oauth2` (google-oauth-client). Falls das Setzen von `code_verifier` per Map nicht greift, `AuthorizationCodeTokenRequest.set("code_verifier", verifier)` verwenden.

- [ ] **Step 4: Test-application-Properties** — in `backend/src/test/resources/application.yml` (falls vorhanden) sicherstellen, dass keine echten Google-URLs erzwungen werden; der Test injiziert die URLs direkt über den Konstruktor.

- [ ] **Step 5: Grün** — `./gradlew test --tests "...GoogleOAuthFlowTest"` → PASS (5).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt
git commit -m "feat(backend): add GoogleOAuthFlow (authorize/exchange/refresh/userinfo/revoke) and token prober"
```

---

### Task 11: ConnectionService (Authorize-Start + Callback + Disconnect)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/connection/ConnectionService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/connection/ConnectionServiceTest.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/members/FamilyMemberRepository.kt` (falls nötig: keine Änderung — Zugriff über bestehendes Repo)

**Interfaces:**
- Consumes: `CredentialsService`, `GoogleOAuthFlow`, `OAuthStateStore`, `PkceGenerator`, `GoogleConnectionRepository`, `FamilyMemberRepository`, `EncryptionService`, `SettingsService` (für `google.connected`), `RedirectUriNormalizer`.
- Produces:
  `startAuthorization(credentialsId: UUID?, returnUrl: String): String` (authUrl)
  `handleCallback(code: String, state: String): CallbackResult`
  `listConnections(): List<ConnectionView>`
  `disconnect(connectionId: UUID)`, `refreshConnection(connectionId: UUID)`
  `CallbackResult(memberId, memberName, isNewMember, returnUrl)`, `ConnectionView(memberId, email, name, status, lastSyncedAt, scopes)`.

- [ ] **Step 1: Failing test** (relevante Zweige)

Testfälle:
1. `startAuthorization(null, "/setup")` nutzt Primary-Credentials, legt State an, liefert authUrl. (mock `flow.buildAuthorizationUrl` → URL)
2. `handleCallback` mit unbekanntem State → `ValidationException` (CSRF).
3. `handleCallback` mit gültigem State, **neuem** Konto → legt FamilyMember an (`role='parent'`, Farbe aus Palette), speichert verschlüsselte Tokens, `isNewMember=true`, setzt `google.connected=true`.
4. `handleCallback` mit bestehender Connection (gleiche `googleAccountId`) → aktualisiert refresh_token + scopes (`isNewMember=false`).
5. `handleCallback` ohne refresh_token → `ValidationException` (fachlich, nicht 500).
6. `disconnect` ruft `flow.revoke` und löscht **nur** diese Connection.

```kotlin
package com.familyhub.google.connection

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.credentials.GoogleCredentials
import com.familyhub.google.oauth.*
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.settings.SettingsService
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.*
import org.assertj.core.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

class ConnectionServiceTest {
    private val credentials = mockk<CredentialsService>()
    private val flow = mockk<GoogleOAuthFlow>()
    private val stateStore = mockk<OAuthStateStore>()
    private val pkce = mockk<PkceGenerator>()
    private val connections = mockk<GoogleConnectionRepository>(relaxed = true)
    private val members = mockk<FamilyMemberRepository>(relaxed = true)
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val settings = mockk<SettingsService>(relaxed = true)
    private lateinit var service: ConnectionService

    private val credEntity = GoogleCredentials(
        clientId = enc.encrypt("cid"), clientSecret = enc.encrypt("sec"),
        redirectUri = "http://localhost:8080/oauth/callback", nickname = "Familie", isPrimary = true,
    ).also { it.id = UUID.randomUUID() }

    @BeforeEach fun setup() {
        service = ConnectionService(credentials, flow, stateStore, pkce, connections, members, enc, settings)
    }

    @Test fun `handleCallback rejects unknown state`() {
        every { stateStore.consume("bad") } returns null
        assertThatThrownBy { service.handleCallback("code", "bad") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `handleCallback creates member and stores tokens for new account`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credEntity.id, "/setup", "verifier")
        every { credentials.entity(credEntity.id!!) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns
            GoogleTokenSet("AT", "RT", 3600, "https://www.googleapis.com/auth/calendar")
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-123", "papa@ex.de", "Papa", null)
        every { connections.findByGoogleAccountId("g-123") } returns null
        every { members.save(any()) } answers { (firstArg() as FamilyMember).also { it.id = UUID.randomUUID() } }
        every { members.count() } returns 1

        val result = service.handleCallback("code", "s")

        assertThat(result.isNewMember).isTrue()
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "RT" && it.status == "active" }) }
        verify { settings.setGoogleConnected(true) }
    }

    @Test fun `handleCallback fails without refresh token`() {
        every { stateStore.consume("s") } returns OAuthStateEntry(credEntity.id, "/", "v")
        every { credentials.entity(credEntity.id!!) } returns credEntity
        every { flow.exchangeCode(any(), any(), any(), any(), any()) } returns GoogleTokenSet("AT", null, 3600, null)
        every { flow.fetchUserInfo("AT") } returns GoogleUserInfo("g-1", "a@b.de", "A", null)
        every { connections.findByGoogleAccountId(any()) } returns null
        assertThatThrownBy { service.handleCallback("code", "s") }
            .isInstanceOf(ValidationException::class.java)
    }
}
```

- [ ] **Step 2: Rot** — FAIL (Service/`settings.setGoogleConnected` fehlen).

- [ ] **Step 3: `SettingsService` um Helfer erweitern**

In `SettingsService.kt` ergänzen:

```kotlin
    fun setGoogleConnected(value: Boolean) = setValue("google.connected", value.toString())
    fun timezone(): String = getValue("family.timezone") ?: "Europe/Berlin"
    fun syncIntervalMinutes(): Long = getValue("google.sync.interval.minutes")?.toLongOrNull() ?: 15
```

(`setValue`/`getValue` sind bereits `private` — auf `internal` oder Nutzung über neue public Methoden anpassen.)

- [ ] **Step 4: ConnectionService implementieren**

```kotlin
package com.familyhub.google.connection

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.oauth.*
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.settings.SettingsService
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

data class CallbackResult(val memberId: UUID, val memberName: String, val isNewMember: Boolean, val returnUrl: String)
data class ConnectionView(
    val connectionId: UUID, val memberId: UUID, val email: String, val name: String,
    val status: String, val lastSyncedAt: Instant?, val scopes: List<String>,
)

@Service
class ConnectionService(
    private val credentials: CredentialsService,
    private val flow: GoogleOAuthFlow,
    private val stateStore: OAuthStateStore,
    private val pkce: PkceGenerator,
    private val connections: GoogleConnectionRepository,
    private val members: FamilyMemberRepository,
    private val encryption: EncryptionService,
    private val settings: SettingsService,
) {
    private val palette = listOf("blue", "pink", "green", "purple", "orange", "teal")

    fun startAuthorization(credentialsId: UUID?, returnUrl: String): String {
        val cred = credentialsId?.let { credentials.entity(it) }
            ?: credentials.primaryOrNull()
            ?: throw ResourceNotFoundException("Keine Google-Credentials konfiguriert. Bitte zuerst im Setup einrichten.")
        val clientId = encryption.decrypt(cred.clientId)
        val verifier = pkce.generateVerifier()
        val safeReturn = sanitizeReturnUrl(returnUrl)
        val state = stateStore.create(cred.id, safeReturn, verifier)
        return flow.buildAuthorizationUrl(clientId, cred.redirectUri, state, pkce.challengeFor(verifier))
    }

    @Transactional
    fun handleCallback(code: String, state: String): CallbackResult {
        val entry = stateStore.consume(state)
            ?: throw ValidationException("Ungültiger oder abgelaufener Anmeldevorgang.")
        val cred = entry.credentialsId?.let { credentials.entity(it) }
            ?: credentials.primaryOrNull()
            ?: throw ValidationException("Keine Google-Credentials konfiguriert.")
        val tokens = flow.exchangeCode(
            encryption.decrypt(cred.clientId), encryption.decrypt(cred.clientSecret),
            cred.redirectUri, code, entry.verifier,
        )
        val userInfo = flow.fetchUserInfo(tokens.accessToken)

        val existing = connections.findByGoogleAccountId(userInfo.sub)
        val refresh = tokens.refreshToken
        val member: FamilyMember
        val isNew: Boolean
        if (existing == null) {
            if (refresh == null) throw ValidationException(
                "Google hat kein Refresh-Token geliefert. Bitte den Zugriff in den Google-Kontoeinstellungen entfernen und erneut verbinden.")
            member = members.save(FamilyMember(
                name = userInfo.name ?: userInfo.email, role = "parent",
                color = palette[(members.count() % palette.size).toInt()],
            ))
            connections.save(GoogleConnection(
                familyMemberId = member.id!!, credentialsId = cred.id, googleAccountId = userInfo.sub,
                email = userInfo.email, accessToken = encryption.encrypt(tokens.accessToken),
                refreshToken = encryption.encrypt(refresh),
                tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds),
                scopes = tokens.scope?.split(" ") ?: emptyList(), status = "active",
            ))
            isNew = true
            if (members.count() == 1L) settings.setGoogleConnected(true)
        } else {
            member = members.findById(existing.familyMemberId).orElseThrow {
                ResourceNotFoundException("Mitglied nicht gefunden") }
            existing.accessToken = encryption.encrypt(tokens.accessToken)
            existing.tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds)
            existing.status = "active"
            existing.credentialsId = cred.id
            if (refresh != null) existing.refreshToken = encryption.encrypt(refresh)
            tokens.scope?.let { existing.scopes = it.split(" ") }
            connections.save(existing)
            isNew = false
        }
        return CallbackResult(member.id!!, member.name, isNew, entry.returnUrl)
    }

    fun listConnections(): List<ConnectionView> = connections.findAll().map { c ->
        val name = members.findById(c.familyMemberId).map { it.name }.orElse(c.email)
        ConnectionView(c.id!!, c.familyMemberId, c.email, name, c.status, c.lastSyncedAt, c.scopes)
    }

    @Transactional
    fun disconnect(connectionId: UUID) {
        val c = connections.findById(connectionId).orElseThrow {
            ResourceNotFoundException("Verbindung nicht gefunden") }
        runCatching { flow.revoke(encryption.decrypt(c.refreshToken)) }
        connections.delete(c)
        if (connections.count() == 0L) settings.setGoogleConnected(false)
    }

    private fun sanitizeReturnUrl(url: String): String {
        val t = url.trim()
        return if (t.isEmpty() || !t.startsWith("/") || t.startsWith("//") || t.contains("://")) "/" else t
    }
}
```

- [ ] **Step 5: Grün** — `./gradlew test --tests "...ConnectionServiceTest"` → PASS. Ergänze Tests bis **100 % Branch** (u. a. `startAuthorization` ohne Credentials → Exception; `disconnect` letzte Verbindung → `setGoogleConnected(false)`; `sanitizeReturnUrl`-Zweige).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/connection backend/src/main/kotlin/com/familyhub/settings/SettingsService.kt backend/src/test/kotlin/com/familyhub/google/connection
git commit -m "feat(backend): add ConnectionService for OAuth start, callback and disconnect"
```

---

### Task 12: OpenAPI + GoogleAuthController (authorize/callback/connections)

**Files:**
- Modify: `api/openapi.yml` (Tag `GoogleAuth`; Pfade `/v1/google/auth/authorize`, `/v1/google/auth/callback`, `/v1/google/connections`, `/v1/google/connections/{id}/disconnect`, `/v1/google/connections/{id}/refresh`; Schemas `AuthUrlResponse`, `OAuthCallbackRequest`, `OAuthCallbackResponse`, `ConnectionResponse`)
- Create: `backend/src/main/kotlin/com/familyhub/google/connection/GoogleAuthController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/connection/GoogleAuthControllerTest.kt`

**Interfaces:**
- Produces: REST unter `/api/v1/google/auth/*` und `/api/v1/google/connections/*`. `authorize` und `callback` sind **öffentlich** (Callback muss ohne PIN erreichbar sein; State-Nonce ist der Schutz). `disconnect`/`refresh` mit `@RequiresPinSession`.

- [ ] **Step 1: OpenAPI ergänzen.** `GET /v1/google/auth/authorize` mit Query `credentialsId?` (uuid) + `returnUrl?` → `AuthUrlResponse {authUrl}`. `POST /v1/google/auth/callback` Body `OAuthCallbackRequest {code, state}` → `OAuthCallbackResponse {memberId, memberName, isNewMember, returnUrl}`. `GET /v1/google/connections` → `ConnectionResponse[]`. `POST /v1/google/connections/{id}/disconnect` → 200 leer. `POST /v1/google/connections/{id}/refresh` → 200 leer. Alle `security: []`.

- [ ] **Step 2: Generieren + Rot** — `./gradlew openApiGenerate compileKotlin`.

- [ ] **Step 3: Controller**

```kotlin
package com.familyhub.google.connection

import com.familyhub.generated.api.GoogleAuthApi
import com.familyhub.generated.model.*
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class GoogleAuthController(
    private val service: ConnectionService,
) : GoogleAuthApi {

    override fun authorizeGoogle(credentialsId: UUID?, returnUrl: String?): ResponseEntity<AuthUrlResponse> =
        ResponseEntity.ok(AuthUrlResponse(authUrl = service.startAuthorization(credentialsId, returnUrl ?: "/")))

    override fun googleCallback(oAuthCallbackRequest: OAuthCallbackRequest): ResponseEntity<OAuthCallbackResponse> {
        val r = service.handleCallback(oAuthCallbackRequest.code, oAuthCallbackRequest.state)
        return ResponseEntity.ok(OAuthCallbackResponse(
            memberId = r.memberId, memberName = r.memberName,
            isNewMember = r.isNewMember, returnUrl = r.returnUrl))
    }

    override fun listConnections(): ResponseEntity<List<ConnectionResponse>> =
        ResponseEntity.ok(service.listConnections().map {
            ConnectionResponse(memberId = it.memberId, email = it.email, name = it.name,
                status = it.status, lastSyncedAt = it.lastSyncedAt?.let { t -> t.toString() },
                scopes = it.scopes, connectionId = it.connectionId)
        })

    @RequiresPinSession
    override fun disconnectConnection(id: UUID): ResponseEntity<Unit> {
        service.disconnect(id); return ResponseEntity.ok().build()
    }

    @RequiresPinSession
    override fun refreshConnection(id: UUID): ResponseEntity<Unit> {
        service.refreshConnection(id); return ResponseEntity.ok().build()
    }
}
```

> `refreshConnection` in `ConnectionService` ergänzen (delegiert an `GoogleTokenProvider.forceRefresh` — Task 13; bis dahin Stub, der die Connection lädt und `TokenRefreshService` aufruft). Falls Task 13 noch nicht existiert, `refreshConnection` erst in Task 13 anbinden und hier vorerst weglassen (Endpoint dann in Task 13 ergänzen).

- [ ] **Step 4: Controller-Test** (`@WebMvcTest`): callback → 200 mit memberName; authorize → 200 authUrl; connections → 200.

- [ ] **Step 5: Grün** — `./gradlew test --tests "...GoogleAuthControllerTest"`.

- [ ] **Step 6: Commit**

```bash
git add api/openapi.yml backend/src/main/kotlin/com/familyhub/google/connection/GoogleAuthController.kt backend/src/test/kotlin/com/familyhub/google/connection/GoogleAuthControllerTest.kt
git commit -m "feat(api): add Google auth and connection endpoints"
```

---

## Phase D — Token-Provider & Kalender-Client

### Task 13: GoogleTokenProvider

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/token/GoogleTokenProvider.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/token/GoogleTokenProviderTest.kt`

**Interfaces:**
- Consumes: `GoogleConnectionRepository`, `GoogleOAuthFlow`, `CredentialsService`, `EncryptionService`, `Clock`.
- Produces:
  `validAccessToken(connection): String` — refresht bei Ablauf (60 s Puffer), persistiert, gibt Klartext-Token; bei `invalid_grant` → `status='revoked'` + `IllegalStateException`/`GoogleConnectionRevokedException`.
  `forceRefresh(connectionId: UUID)`.

- [ ] **Step 1: Failing test** — Fälle: gültiger Token (nicht abgelaufen) → gibt entschlüsselten Token ohne Refresh; abgelaufen → ruft `flow.refresh`, speichert neuen verschlüsselten Token + neue Expiry; `flow.refresh` wirft `invalid_grant`-`TokenResponseException` → Connection `status='revoked'` + Exception.

```kotlin
package com.familyhub.google.token

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.credentials.GoogleCredentials
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.GoogleOAuthFlow
import com.familyhub.google.oauth.GoogleTokenSet
import com.familyhub.shared.exceptions.GoogleConnectionRevokedException
import com.google.api.client.auth.oauth2.TokenResponseException
import io.mockk.*
import org.assertj.core.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.*
import java.util.UUID

class GoogleTokenProviderTest {
    private val now = Instant.parse("2026-07-23T12:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val connections = mockk<GoogleConnectionRepository>(relaxed = true)
    private val flow = mockk<GoogleOAuthFlow>()
    private val credentials = mockk<CredentialsService>()
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val provider = GoogleTokenProvider(connections, flow, credentials, enc, clock)

    private val cred = GoogleCredentials(enc.encrypt("cid"), enc.encrypt("sec"),
        "http://localhost:8080/oauth/callback", "F", true).also { it.id = UUID.randomUUID() }

    private fun conn(expiresAt: Instant?) = GoogleConnection(
        familyMemberId = UUID.randomUUID(), credentialsId = cred.id, googleAccountId = "g",
        email = "a@b.de", accessToken = enc.encrypt("OLD"), refreshToken = enc.encrypt("RT"),
        tokenExpiresAt = expiresAt,
    ).also { it.id = UUID.randomUUID() }

    @Test fun `returns current token when not near expiry`() {
        val c = conn(now.plusSeconds(600))
        assertThat(provider.validAccessToken(c)).isEqualTo("OLD")
        verify(exactly = 0) { flow.refresh(any(), any(), any()) }
    }

    @Test fun `refreshes and persists when expired`() {
        val c = conn(now.plusSeconds(30)) // within 60s buffer
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", null, 3600, null)
        val token = provider.validAccessToken(c)
        assertThat(token).isEqualTo("NEW")
        verify { connections.save(match { enc.decrypt(it.accessToken!!) == "NEW" }) }
    }

    @Test fun `marks connection revoked on invalid_grant`() {
        val c = conn(now.minusSeconds(10))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } throws mockk<TokenResponseException>(relaxed = true) {
            every { details?.error } returns "invalid_grant"
        }
        assertThatThrownBy { provider.validAccessToken(c) }
            .isInstanceOf(GoogleConnectionRevokedException::class.java)
        verify { connections.save(match { it.status == "revoked" }) }
    }
}
```

- [ ] **Step 2: `GoogleConnectionRevokedException` ergänzen** in `DomainExceptions.kt` (auf HTTP 409 oder 400 gemappt; Meldung „Google-Verbindung abgelaufen. Bitte neu verbinden.").

- [ ] **Step 3: Rot.**

- [ ] **Step 4: Implementieren**

```kotlin
package com.familyhub.google.token

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.GoogleOAuthFlow
import com.familyhub.shared.exceptions.GoogleConnectionRevokedException
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.google.api.client.auth.oauth2.TokenResponseException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class GoogleTokenProvider(
    private val connections: GoogleConnectionRepository,
    private val flow: GoogleOAuthFlow,
    private val credentials: CredentialsService,
    private val encryption: EncryptionService,
    private val clock: Clock,
) {
    @Transactional
    fun validAccessToken(connection: GoogleConnection): String {
        val expiresAt = connection.tokenExpiresAt
        val needsRefresh = expiresAt == null ||
            Instant.now(clock).plusSeconds(BUFFER_SECONDS).isAfter(expiresAt)
        if (!needsRefresh && connection.accessToken != null) {
            return encryption.decrypt(connection.accessToken!!)
        }
        val cred = connection.credentialsId?.let { credentials.entity(it) }
            ?: credentials.primaryOrNull()
            ?: throw ResourceNotFoundException("Keine Google-Credentials konfiguriert.")
        try {
            val newTokens = flow.refresh(
                encryption.decrypt(cred.clientId), encryption.decrypt(cred.clientSecret),
                encryption.decrypt(connection.refreshToken),
            )
            connection.accessToken = encryption.encrypt(newTokens.accessToken)
            connection.tokenExpiresAt = Instant.now(clock).plusSeconds(newTokens.expiresInSeconds)
            connection.status = "active"
            connections.save(connection)
            return newTokens.accessToken
        } catch (ex: TokenResponseException) {
            if (ex.details?.error == "invalid_grant") {
                connection.status = "revoked"
                connections.save(connection)
                throw GoogleConnectionRevokedException()
            }
            throw ex
        }
    }

    @Transactional
    fun forceRefresh(connectionId: UUID) {
        val c = connections.findById(connectionId).orElseThrow {
            ResourceNotFoundException("Verbindung nicht gefunden") }
        c.tokenExpiresAt = Instant.EPOCH // force
        validAccessToken(c)
    }

    companion object { private const val BUFFER_SECONDS = 60L }
}
```

Anschließend `ConnectionService.refreshConnection(id)` an `tokenProvider.forceRefresh(id)` anbinden (Konstruktor-Injektion ergänzen).

- [ ] **Step 5: Grün + Branch-Coverage** — auch den `else`-Zweig (Nicht-`invalid_grant`-Fehler propagiert) und „kein accessToken vorhanden → refresh" testen.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/token backend/src/main/kotlin/com/familyhub/shared/exceptions/DomainExceptions.kt backend/src/main/kotlin/com/familyhub/google/connection/ConnectionService.kt backend/src/test/kotlin/com/familyhub/google/token
git commit -m "feat(backend): add central GoogleTokenProvider with refresh and revoke handling"
```

---

### Task 14: CalendarSubscription + Event Entities & Repos

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscription.kt`, `CalendarSubscriptionRepository.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/Event.kt`, `EventRepository.kt`

**Interfaces:**
- Produces:
  `CalendarSubscription(connectionId, googleCalendarId, summary, backgroundColor?, isPrimary, isSelected, syncToken?)`.
  Repo: `findAllByConnectionId(id)`, `findByConnectionIdAndGoogleCalendarId(id, calId)`, `findAllByConnectionIdAndIsSelectedTrue(id)`.
  `Event(subscriptionId, googleEventId, googleCalendarId, ownerMemberId, title, description?, location?, startTime?, endTime?, isAllDay, allDayStart?, allDayEnd?, recurrenceId?, etag?, googleUpdated?, syncStatus)`.
  Repo: `findByGoogleEventIdAndGoogleCalendarId(...)`, `deleteByGoogleEventIdAndGoogleCalendarId(...)`, `findByStartTimeBetween(...)` bzw. Query für Zeitfenster + Member.

- [ ] **Step 1: Entities + Repos schreiben** (Muster wie `FamilyMember`/`GoogleConnection`; Timestamps via `@PrePersist`/`@PreUpdate`).

- [ ] **Step 2: Kompiliert** — `./gradlew compileKotlin`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscription.kt backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscriptionRepository.kt backend/src/main/kotlin/com/familyhub/google/calendar/Event.kt backend/src/main/kotlin/com/familyhub/google/calendar/EventRepository.kt
git commit -m "feat(backend): add CalendarSubscription and Event entities and repositories"
```

---

### Task 15: GoogleCalendarClient (Library-Wrapper)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/GoogleCalendarClient.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/GoogleCalendarClientTest.kt` (WireMock als Calendar-API-Stub)

**Interfaces:**
- Consumes: `GoogleTokenProvider`, Google-Calendar-Library, Basis-URL (default `https://www.googleapis.com`, im Test WireMock).
- Produces:
  `listCalendars(connection): List<GoogleCalendarInfo>` (paginiert)
  `listEvents(connection, calendarId, syncToken?, timeMin, timeMax): EventPage(events, nextSyncToken, fullResyncRequired)` — durchläuft alle Seiten; bei HTTP 410 `fullResyncRequired=true`.
  `insertEvent(connection, calendarId, googleEvent): com.google.api.services.calendar.model.Event`
  `updateEvent(...)`, `deleteEvent(connection, calendarId, eventId)`.
  `GoogleCalendarInfo(id, summary, backgroundColor?, primary: Boolean)`.

- [ ] **Step 1: Failing test** — stubbe `GET /calendar/v3/users/me/calendarList` (2 Seiten via `nextPageToken`) und `GET /calendar/v3/calendars/{id}/events` (Seite + `nextSyncToken`); prüfe Pagination-Vollständigkeit und Sync-Token-Rückgabe; stubbe `410` → `fullResyncRequired=true`.

- [ ] **Step 2: Rot.**

- [ ] **Step 3: Implementieren** — `Calendar.Builder(transport, GsonFactory, requestInitializer)` mit `requestInitializer`, der `Authorization: Bearer <tokenProvider.validAccessToken(connection)>` setzt und die Root-URL (Basis-URL) überschreibt. `listEvents` mit `setSyncToken`/`setTimeMin`/`setTimeMax`/`setSingleEvents(true)`/`setShowDeleted(true)`, Schleife über `pageToken`; fängt `GoogleJsonResponseException` mit Status 410. Timeouts über den Transport aus `GoogleApiClientFactory`.

- [ ] **Step 4: Grün.**

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/GoogleCalendarClient.kt backend/src/test/kotlin/com/familyhub/google/calendar/GoogleCalendarClientTest.kt
git commit -m "feat(backend): add GoogleCalendarClient with pagination and full-resync handling"
```

---

### Task 16: EventMapper

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/EventMapper.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt`

**Interfaces:**
- Consumes: `SettingsService` (Zeitzone).
- Produces:
  `toEntity(google: com.google.api.services.calendar.model.Event, subscription, ownerMemberId): Event` (Zeitpunkt→UTC; Ganztag→`all_day_start`/`all_day_end` mit exklusivem Ende −1 Tag; Titel-Fallback „Ohne Titel").
  `isCancelled(google): Boolean`.
  `toGoogleEvent(cmd: EventCommand): com.google.api.services.calendar.model.Event`.
  `EventCommand(title, description?, location?, start: Instant?, end: Instant?, allDayStart: LocalDate?, allDayEnd: LocalDate?, isAllDay)`.

- [ ] **Step 1: Failing test** — timed event mapping (dateTime→startTime UTC), all-day mapping (end.date exklusiv → allDayEnd −1 Tag), `status='cancelled'` → `isCancelled=true`, fehlender Titel → „Ohne Titel".

- [ ] **Step 2: Rot.**

- [ ] **Step 3: Implementieren** — konvertiert `com.google.api.client.util.DateTime` ↔ `Instant`; Ganztag über `EventDateTime.getDate()`.

- [ ] **Step 4: Grün (alle Zweige).**

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/EventMapper.kt backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt
git commit -m "feat(backend): add EventMapper (all-day, timezone, cancelled, title fallback)"
```

---

## Phase E — Sync + Kalender-/Event-API

### Task 17: CalendarSyncService

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSyncService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSyncServiceTest.kt`

**Interfaces:**
- Consumes: `GoogleCalendarClient`, `CalendarSubscriptionRepository`, `EventRepository`, `EventMapper`, `GoogleConnectionRepository`, `Clock`.
- Produces:
  `refreshCalendars(connection)` — upsert subscriptions (neue: `isSelected=false`).
  `syncConnection(connection): SyncResult(created, updated, deleted)` — pro selektierter Subscription inkrementell; 410→Vollsync mit Zeitfenster −1 Monat…+12 Monate; `cancelled`→lokal löschen; neuen Sync-Token speichern; `lastSyncedAt` setzen.
  `syncAll()`.

- [ ] **Step 1: Failing test** — mocked `GoogleCalendarClient`: eine selektierte Subscription; `listEvents` liefert 1 neues + 1 cancelled Event → `created=1, deleted=1`; Sync-Token wird gespeichert; `lastSyncedAt` gesetzt. Zweiter Test: `fullResyncRequired=true` beim ersten Call → Vollsync-Pfad (timeMin/timeMax gesetzt), danach Sync-Token.

- [ ] **Step 2: Rot.**

- [ ] **Step 3: Implementieren** — Logik gemäß Spec Abschnitt 5; Upsert per `(google_event_id, google_calendar_id)`; „Google gewinnt" = überschreibt lokale Felder; Löschung nur bei `isCancelled`.

- [ ] **Step 4: Grün (alle Zweige, inkl. Connection `status!='active'` übersprungen, leere Auswahl).**

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSyncService.kt backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSyncServiceTest.kt
git commit -m "feat(backend): add CalendarSyncService with incremental sync and full-resync"
```

---

### Task 18: CalendarSyncScheduler

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/sync/CalendarSyncScheduler.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/Application.kt` (falls `@EnableScheduling` fehlt — ergänzen bzw. eigene `@Configuration`)
- Test: `backend/src/test/kotlin/com/familyhub/google/sync/CalendarSyncSchedulerTest.kt`

**Interfaces:**
- Consumes: `CalendarSyncService`, `GoogleConnectionRepository`, `SettingsService`.
- Produces: `runScheduledSync()` (mit `@Scheduled(fixedDelayString ...)` oder manueller Reschedule); Overlap-Guard (In-Memory-`AtomicBoolean`), Logging der Ergebnisse/Fehler pro Connection.

- [ ] **Step 1: Failing test** — `runScheduledSync` ruft `syncConnection` für jede aktive Connection; wirft eine Connection eine Exception, läuft die nächste weiter (failure isoliert, geloggt). Overlap-Guard: zweiter paralleler Aufruf wird übersprungen.

- [ ] **Step 2–4:** Rot → implementieren (`@Scheduled(fixedDelayString = "\${google.sync.fixed-delay-ms:900000}")`, Default 15 min) → grün.

> Scheduler-Klasse liegt in `sync/` (nicht `config/`), zählt also zum Coverage-Gate — Branch-Coverage sicherstellen (try/catch pro Connection, Guard-Zweig).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/sync backend/src/main/kotlin/com/familyhub/Application.kt backend/src/test/kotlin/com/familyhub/google/sync
git commit -m "feat(backend): add CalendarSyncScheduler with overlap guard and isolated failures"
```

---

### Task 19: OpenAPI + CalendarController (calendars, selected, manual sync)

**Files:**
- Modify: `api/openapi.yml` (Tag `GoogleCalendars`; Pfade `/v1/google/calendars`, `/v1/google/calendars/selected`, `/v1/google/calendars/sync`; Schemas `CalendarResponse`, `SelectedCalendarsRequest`, `SyncResultResponse`)
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarController.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarQueryService.kt` (list/select-Logik)
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarControllerTest.kt`

**Interfaces:**
- Produces: `GET /v1/google/calendars?memberId=` → `CalendarResponse[]`; `PUT /v1/google/calendars/selected {memberId, calendarIds[]}` → 200; `POST /v1/google/calendars/sync?memberId=` → `SyncResultResponse`. Auswahl-Endpunkte `@RequiresPinSession` (Konfiguration), sync offen (Wizard/Anzeige). `GET` offen.
- Consumes: `CalendarQueryService` (`listForMember`, `saveSelection`), `CalendarSyncService` (manueller Trigger über Connection des Members).

- [ ] **Step 1–2:** OpenAPI ergänzen, generieren, `CalendarQueryService` + Controller schreiben (Test rot).
- [ ] **Step 3:** `CalendarQueryService`: Member→Connection→Subscriptions; bei `GET` optional `refreshCalendars` aufrufen, damit neue Kalender erscheinen. `saveSelection` setzt `isSelected`.
- [ ] **Step 4:** Controller-Test grün.
- [ ] **Step 5: Commit** `feat(api): add Google calendar list, selection and manual sync endpoints`.

---

### Task 20: EventService (Lesen aus Spiegel + Write-through)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventServiceTest.kt`

**Interfaces:**
- Consumes: `EventRepository`, `CalendarSubscriptionRepository`, `GoogleConnectionRepository`, `GoogleCalendarClient`, `EventMapper`, `SettingsService`.
- Produces:
  `list(start: Instant?, end: Instant?, memberId: UUID?, calendarId: String?): List<EventView>`
  `get(id): EventView`
  `create(cmd: CreateEventCommand): EventView` — push zu Google (insert), dann lokal spiegeln.
  `update(id, cmd): EventView` — push (update), dann spiegeln.
  `delete(id)` — Google delete, dann lokal.
  `CreateEventCommand(memberId, calendarId?, title, description?, location?, start?, end?, allDayStart?, allDayEnd?, isAllDay)`.

- [ ] **Step 1: Failing test** — `create`: `GoogleCalendarClient.insertEvent` liefert Google-Event → lokal gespeichert mit `etag`, `sync_status='synced'`; Zielkalender = Primär-Subscription der Connection, falls `calendarId` fehlt. `delete`: erst Google, dann lokal (verify Reihenfolge). `list`: filtert nach Zeitfenster/Member.

- [ ] **Step 2–4:** Rot → implementieren → grün (alle Zweige, inkl. fehlende Connection → `ResourceNotFoundException`, kein Zielkalender → `ValidationException`).

- [ ] **Step 5: Commit** `feat(backend): add EventService with write-through to Google`.

---

### Task 21: OpenAPI + EventController

**Files:**
- Modify: `api/openapi.yml` (Tag `Events`; Pfade `/v1/events`, `/v1/events/{id}`; Schemas `EventResponse`, `EventCreateRequest`, `EventUpdateRequest`)
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/EventController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventControllerTest.kt`

**Interfaces:**
- Produces: `GET /v1/events?start=&end=&memberId=&calendarId=`, `GET/POST/PUT/DELETE`. Alle **öffentlich** (`security: []`), Zuschreibung über `memberId` im Body/Query. `start`/`end` als ISO-8601-String geparst (`Instant.parse` bzw. `LocalDate` + Tagesbeginn in `family.timezone`).

- [ ] **Step 1–4:** OpenAPI, generieren, Controller + Parser (`start`/`end`) mit Test.
- [ ] **Step 5: Commit** `feat(api): add event CRUD endpoints`.

---

### Task 22: Backend-Integrationstest (E2E gegen WireMock-Google)

**Files:**
- Create: `backend/src/test/kotlin/com/familyhub/google/GoogleFlowIntegrationTest.kt`

**Interfaces:**
- Consumes: voller Spring-Context (Testcontainers-Postgres) + WireMock-Google (Token/UserInfo/Calendar). Google-URLs über Test-Properties auf WireMock zeigen lassen (`google.token-url` etc. via `@DynamicPropertySource`).

- [ ] **Step 1: Test schreiben** — Ablauf: Credentials anlegen (POST) → `authorize` → simulierter Callback (POST /callback mit gestubbtem Token+UserInfo) → Connection erscheint in `GET /connections` → `calendars` listet gestubbte Kalender → `selected` speichern → `sync` importiert Events → `GET /v1/events` liefert sie. Zusätzlich: PIN-Enforcement — nach `set-pin` ist `POST /credentials` ohne `X-Pin-Session` → 401.

- [ ] **Step 2: Grün.**
- [ ] **Step 3: Commit** `test(backend): add end-to-end Google flow integration test`.

---

## Phase F — Frontend

### Task 23: Orval-Client regenerieren + Google-Hooks

**Files:**
- Modify (generiert): `frontend/src/api/generated/**` (via Orval-Command)
- Create: `frontend/src/features/google/useGoogleCredentials.ts`, `useGoogleConnections.ts`, `useCalendars.ts`
- Test: `frontend/src/features/google/useGoogleConnections.test.tsx`

**Interfaces:**
- Consumes: generierte Orval-Hooks/Typen aus der aktualisierten `openapi.yml`.
- Produces: TanStack-Query-Hooks: `useGoogleConnections()`, `useGoogleCredentials()`, `useCreateCredentials()`, `useValidateCredentials()`, `useCalendarsForMember(memberId)`, `useSaveSelectedCalendars()`, `useStartGoogleAuth()`, `useGoogleCallback()`, `useDisconnectConnection()`.

- [ ] **Step 1: Orval regenerieren**

Run: `cd frontend && npm run generate` (bzw. der in `package.json` definierte Orval-Befehl; vorher sicherstellen, dass alle OpenAPI-Ergänzungen committet sind).
Expected: neue Typen/Hooks unter `src/api/generated`.

- [ ] **Step 2: Hooks + Test schreiben** (Muster wie `features/members/useMembersQuery.ts`; Query-Keys `['google','connections']`, `['google','calendars',memberId]`; Mutations invalidieren passende Keys). Test mit MSW + `renderHook` (Muster `useMembersQuery.test.tsx`).

- [ ] **Step 3: Grün** — `cd frontend && npm test -- useGoogleConnections`.

- [ ] **Step 4: Commit** `feat(frontend): regenerate API client and add Google query hooks`.

---

### Task 24: OAuthCallback-Seite + Route

**Files:**
- Create: `frontend/src/features/google/OAuthCallback.tsx`
- Test: `frontend/src/features/google/OAuthCallback.test.tsx`
- Modify: `frontend/src/routing/*` (Route `/oauth/callback` registrieren)

**Interfaces:**
- Consumes: `useGoogleCallback()` (POST `/v1/google/auth/callback`).
- Produces: Seite, die `code`/`state`/`error` aus der URL liest, bei `error` „Google-Authentifizierung wurde abgebrochen." zeigt, sonst callback aufruft, „Erfolgreich verbunden!" + „Willkommen, {memberName}!" zeigt und nach kurzer Verzögerung auf `returnUrl` navigiert.

- [ ] **Step 1: Failing test** — rendert mit `?code=x&state=y`, MSW stubbt callback → erwartet Erfolgstext + Navigation zu `returnUrl`; mit `?error=access_denied` → Abbruchtext.
- [ ] **Step 2–4:** Rot → implementieren → grün.
- [ ] **Step 5: Commit** `feat(frontend): add OAuth callback page and route`.

---

### Task 25: Wizard auf 7 Schritte erweitern

**Files:**
- Modify: `frontend/src/features/setup/SetupWizard.tsx` (7 Schritte, Fortschritt, Resume über `currentStep`)
- Create: `frontend/src/features/setup/GoogleGuideStep.tsx`, `CredentialsStep.tsx`, `ConnectStep.tsx`, `CalendarSelectStep.tsx`
- Modify: `backend` `SettingsService.updateSetupStep` Range `1..7` und `getSetupStatus` (siehe unten)
- Modify: `api/openapi.yml` `SetupStatusResponse` um `hasCredentials`, `hasConnection`, `hasSelectedCalendars` erweitern; `setup-step` erlaubt 1..7
- Test: `frontend/src/features/setup/SetupWizard.test.tsx` (erweitern), Backend `SettingsServiceTest` (erweitern)

**Interfaces:**
- Consumes: Google-Hooks aus Task 23, `authorize`/`calendars`/`selected`.
- Produces: 7-Schritt-Wizard; `GoogleGuideStep` (4 Accordion-Checkboxen, Scope-Liste, **eine** Redirect-URI `${origin}/oauth/callback`), `CredentialsStep` (4 Felder, „Verbindung testen", speichern→`credentialsId`), `ConnectStep` (authorize→`window.location.href`), `CalendarSelectStep` (Primär vorausgewählt, ≥1 erzwungen, speichern).

- [ ] **Step 1: Backend Setup-Status erweitern** (TDD in `SettingsServiceTest`):

`getSetupStatus` zusätzlich:
```kotlin
hasCredentials = credentialsRepository.count() > 0,
hasConnection = connectionRepository.findAllByStatus("active").isNotEmpty(),
hasSelectedCalendars = /* mind. eine Subscription is_selected */,
currentStep = computeStep(...),
```
`computeStep`: keine Members→2; keine Credentials→3; keine Connection→5; keine ausgewählten Kalender→6; keine PIN→7; sonst 7. `updateSetupStep` Range auf `1..7`.

- [ ] **Step 2: OpenAPI `SetupStatusResponse` erweitern + generieren** (Backend + Frontend).

- [ ] **Step 3: Wizard-Steps schreiben (Frontend-Tests je Step).** Fortschritt „Schritt {n} von 7".

- [ ] **Step 4: Grün** — Backend `SettingsServiceTest`, Frontend `SetupWizard.test.tsx` + Step-Tests.

- [ ] **Step 5: Commit** `feat: extend setup wizard with Google steps (7 steps) and resume`.

---

### Task 26: Settings — Google-Konten & Kalenderverwaltung

**Files:**
- Create: `frontend/src/features/google/GoogleAccountsSettings.tsx`, `CalendarManagement.tsx`
- Modify: `frontend/src/features/settings/SettingsView.tsx` (Bereiche einbinden)
- Test: entsprechende `*.test.tsx`

**Interfaces:**
- Consumes: `useGoogleConnections`, `useDisconnectConnection`, `useGoogleCredentials`, `useCalendarsForMember`, `useSaveSelectedCalendars`, PIN-Session-Context.
- Produces: Bereich „Google-Konten" (Status inkl. „Verbindung abgelaufen — bitte neu verbinden" bei `status='revoked'`, weiteres Konto verbinden, trennen, Credentials verwalten) und „Kalender verwalten" (Auswahl je Konto). Aktionen ohne PIN-Session deaktiviert mit Hinweis „Melde dich mit PIN an, um Kalender zu verwalten."

- [ ] **Step 1–4:** Komponenten + Tests (MSW), grün.
- [ ] **Step 5: Commit** `feat(frontend): add Google accounts and calendar management to settings`.

---

## Phase G — Betrieb & Doku

### Task 27: Health-Indicator + INSTALLATION.md

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/GoogleHealthIndicator.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/GoogleHealthIndicatorTest.kt`
- Modify: `INSTALLATION.md`

**Interfaces:**
- Consumes: `GoogleConnectionRepository`, `Clock`.
- Produces: `HealthIndicator` „google" mit Details `activeConnections`, `revokedConnections`, `lastSyncAgeMinutes`.

- [ ] **Step 1: Failing test** — bei einer aktiven + einer revoked Connection liefert der Indicator entsprechende Details; ohne Verbindungen `status=UNKNOWN`/`UP` mit `activeConnections=0`.
- [ ] **Step 2–4:** implementieren → grün.
- [ ] **Step 5: INSTALLATION.md ergänzen** — Google-Cloud-Einrichtung: Projekt, Google Calendar API aktivieren, OAuth-Consent-Screen (Scopes `calendar`, `userinfo.profile`, `userinfo.email`; Testnutzer eintragen; Hinweis 7-Tage-Refresh-Token-Ablauf im Testing-Status), OAuth-Client-ID Web mit **einer** Redirect-URI `<origin>/oauth/callback`. Sync-Intervall/Zeitzone-Settings dokumentieren.
- [ ] **Step 6: Commit** `feat(backend): add Google health indicator; docs: Google Cloud setup`.

---

### Task 28: Vollständiger Lauf + CI-Gate

**Files:** keine (Verifikation)

- [ ] **Step 1: Backend komplett** — `cd backend && ./gradlew clean check` → BUILD SUCCESSFUL (JaCoCo 90 % Line / 100 % Branch erfüllt). Falls Branch-Coverage < 100 %: fehlende Zweige gezielt testen.
- [ ] **Step 2: Frontend komplett** — `cd frontend && npm run lint && npm test -- --run && npm run build` → grün.
- [ ] **Step 3: E2E** — `cd frontend && npm run test:e2e` (Playwright-Wizard-Pfad) → grün.
- [ ] **Step 4: Commit** (falls Nacharbeiten) `test: close coverage gaps for Google integration`.

---

## Self-Review

**Spec-Abdeckung:**
- Datenmodell V4–V8 → Task 3. Crypto → Task 2. RedirectUri → Task 5. Credentials CRUD/Primary/Validate → Task 6/7. State-Nonce+PKCE → Task 8. OAuth-Flow → Task 10. Callback/Member-Upsert/kein-Refresh-Token/Re-Auth → Task 11. Connections/Disconnect(revoke, einzeln) → Task 11/12. TokenProvider/invalid_grant→revoked → Task 13. Calendar-Client/Pagination/410 → Task 15. EventMapper (Ganztag/Zeitzone/cancelled/Titel) → Task 16. Sync (inkrementell/Vollsync/Löschung) → Task 17. Scheduler → Task 18. Calendar-API → Task 19. Event write-through → Task 20/21. Setup-Status/Resume vereinheitlicht → Task 25. Frontend Wizard/Callback/Settings → Task 23–26. Health/INSTALLATION → Task 27. CI-Gate → Task 28. **Alle Spec-Abschnitte 1–9 abgedeckt.**
- Bewusst nicht enthalten (Spec §10): Kalenderansicht, calendar_assignments, Tasks, Konflikt-UI, SSE, Key-Rotation, Photos — in keinem Task, korrekt.

**Platzhalter-Scan:** Mechanische Tasks (14, 15, 19, 20, 21, 23–27) beschreiben Interfaces + Testfälle konkret und lehnen sich an existierende Muster; kein „TODO/TBD". Kern-Logik-Tasks (2, 5, 6, 8, 10, 11, 13) enthalten vollständigen Code + Tests.

**Typ-Konsistenz:** `ProbeResult`/`TokenEndpointProber` (Task 6) = implementiert in Task 10. `GoogleTokenSet`/`GoogleUserInfo` (Task 10) genutzt in Task 11/13. `OAuthStateEntry(credentialsId, returnUrl, verifier)` (Task 8) genutzt in Task 11. `GoogleConnectionRevokedException` (Task 13) referenziert in Task 26-UI-Text. `SettingsService.setGoogleConnected/timezone/syncIntervalMinutes` (Task 11) genutzt in Task 13/16/18/25. `validAccessToken(connection)` durchgängig gleich benannt.

**Reihenfolge-Abhängigkeit aufgelöst:** `CredentialsService.validate` hängt an `TokenEndpointProber` (Interface in Task 6, Impl in Task 10) — dokumentiert, damit Task 6 unabhängig testbar bleibt.
