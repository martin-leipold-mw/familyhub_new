# Multi-Account Kalender-Sync & Farbe-pro-Kalender — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jedes verbundene Google-Konto synchronisiert mehrere Kalender mit genau einem Schreibziel; Termine werden pro Kalender eingefärbt (persönlich = Kontofarbe, geteilt = eigene deterministische Farbe), und der geplante Sync entdeckt Kalender aller Konten zuverlässig.

**Architecture:** Architektur A aus dem Design (`docs/superpowers/specs/2026-08-03-multi-account-calendar-color-design.md`): das **Backend** löst die Farbe je Kalender auf und liefert sie als fertige Farb-Zeichenkette in einer aggregierten Kalender-Liste. Das Frontend färbt Events über `event.calendarId` aus einer `Map<calendarId, color>`. Zwei Flags (`is_shared`, `is_write_target`) auf `calendar_subscriptions` steuern Farbquelle und Schreibziel.

**Tech Stack:** Kotlin 2 / Spring Boot 3 (Java 21, Gradle), PostgreSQL + Flyway, JPA; React 18 / TypeScript / Vite, TanStack Query, orval (contract-first); Tests: JUnit5 + mockk + Testcontainers (Backend), vitest + Testing Library + Playwright (Frontend).

## Global Constraints

- **Contract-first.** `api/openapi.yml` ist die einzige Quelle für die REST-API. Generierte Clients **nie** von Hand editieren — Spec ändern, dann regenerieren (Backend: `openApiGenerate` läuft im Build; Frontend: `npm run generate:api`). Generierte Dateien sind gitignored.
- **Backend braucht Java 21.** `JAVA_HOME` muss auf ein JDK 21 zeigen, sonst bricht `./gradlew` mit `IllegalArgumentException: 25.0.3` ab.
- **Backend-Tests brauchen Docker** (Testcontainers startet PostgreSQL 16).
- **Flyway: nie eine angewandte Migration editieren.** Nächste freie Version ist **`V10`** (bestehend: `V1`…`V9`).
- **PIN-Schutz backend-seitig.** Schreibende Kalender-Operationen tragen die Methoden-Annotation `@RequiresPinSession` (durchgesetzt vom `PinSessionInterceptor`). Der PIN wird von keinem Endpoint zurückgegeben.
- **Farbwerte-Duplikat halten Backend↔Frontend synchron.** Die Mitglieds-Palette lebt als HSL-Werte im Frontend (`frontend/src/features/members/colors.ts` → `MEMBER_COLORS`). Damit persönliche Kalender dieselbe Farbe wie das Mitglieds-Avatar bekommen, spiegelt der Backend-Wert `MemberColorPalette` **exakt dieselben HSL-Strings**. Die Shared-Palette existiert **nur** im Backend (`SharedCalendarPalette`) — das Frontend braucht sie nicht, weil das Backend bereits die aufgelöste Farbe liefert.
- **German-UI:** alle sichtbaren Strings deutsch. Touch-Targets ≥ 44 px.
- **Gates vor Fertig:** Backend `cd backend && ./gradlew check`; Frontend `cd frontend && npm run check`; E2E `cd frontend && npm run test:e2e`. Ein Feature ist erst fertig, wenn es über die UI erreichbar ist, Tests grün sind und CI läuft.

---

## Rekonziliation mit dem Design (im Code verifiziert)

Zwei Punkte weichen bewusst vom Design-Text ab, weil der Code anders liegt als angenommen:

1. **Scheduler.** Der `CalendarSyncScheduler` iteriert bereits über **alle** aktiven Verbindungen und ruft `CalendarSyncService.syncConnection(connection)` je Konto (`CalendarSyncSchedulerTest` belegt das). Die eigentliche Lücke: `syncConnection` ruft **`refreshCalendars` nicht** auf, bevor es über die *ausgewählten* Subscriptions iteriert. Fix daher in `syncConnection` (Task 5), nicht im Scheduler.
2. **Farbe im Frontend.** Das Backend besitzt heute **keine** Hex/HSL-Werte — `FamilyMember.color` ist nur ein Token (`"green"`), die HSL-Auflösung liegt allein im Frontend. Architektur A verlangt, die HSL-Werte ins Backend zu spiegeln (`MemberColorPalette`). Die Shared-Palette entsteht neu und nur im Backend.

## File Structure

**Backend (neu)**
- `backend/src/main/resources/db/migration/V10__calendar_flags.sql` — Spalten `is_shared`, `is_write_target` + Teil-Unique-Index.
- `backend/src/main/kotlin/com/familyhub/google/calendar/MemberColorPalette.kt` — Token→HSL (Spiegel von `MEMBER_COLORS`).
- `backend/src/main/kotlin/com/familyhub/google/calendar/SharedCalendarPalette.kt` — Shared-Palette + deterministische Auswahl.
- `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarColorResolver.kt` — löst Farbe je Subscription auf.

**Backend (geändert)**
- `google/calendar/CalendarSubscription.kt` (+2 Felder), `CalendarSubscriptionRepository.kt` (+1 Methode).
- `google/calendar/CalendarSyncService.kt` (`syncConnection` ruft `refreshCalendars`).
- `google/calendar/EventService.kt` (`create` bevorzugt `isWriteTarget`).
- `google/oauth/GoogleOAuthFlow.kt` (`prompt=select_account consent`).
- `google/calendar/CalendarQueryService.kt` (Farbe+Owner in Views, `listAll`, `updateFlags`).
- `google/calendar/CalendarController.kt` (`listAllCalendars`, `updateCalendarFlags`).
- `api/openapi.yml` (`CalendarResponse`-Felder, `/calendars/all`, `/calendars/flags`, `CalendarFlagsRequest`).

**Frontend (geändert)**
- `features/calendar/useCalendarEvents.ts` (`calendarId` in `CalendarEvent`).
- `features/google/useCalendars.ts` (`useAllCalendars`, `useUpdateCalendarFlagsMutation`).
- `features/calendar/WeekGrid.tsx`, `DayGrid.tsx`, `AgendaList.tsx`, `CalendarView.tsx` (Farbe per `calendarId`).
- `features/google/CalendarManagement.tsx` (Flag-Bedienelemente).
- `features/setup/CalendarSelectStep.tsx` (über alle Verbindungen iterieren).

---

## Task 1: Flyway V10 — Flags-Spalten + Teil-Unique-Index

**Files:**
- Create: `backend/src/main/resources/db/migration/V10__calendar_flags.sql`
- Test: `backend/src/test/kotlin/com/familyhub/google/CalendarFlagsMigrationTest.kt`

**Interfaces:**
- Produces: Spalten `calendar_subscriptions.is_shared BOOLEAN NOT NULL`, `calendar_subscriptions.is_write_target BOOLEAN NOT NULL`; Teil-Unique-Index `idx_calendar_subscriptions_write_target`.

- [ ] **Step 1: Write the failing test**

`backend/src/test/kotlin/com/familyhub/google/CalendarFlagsMigrationTest.kt`
```kotlin
package com.familyhub.google

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional

@Transactional
class CalendarFlagsMigrationTest
    @Autowired
    constructor(
        private val jdbc: JdbcTemplate,
    ) : BaseIntegrationTest() {
        @Test
        fun `V10 adds is_shared and is_write_target columns`() {
            val cols =
                jdbc.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                        "WHERE table_name = 'calendar_subscriptions'",
                    String::class.java,
                )
            assertThat(cols).contains("is_shared", "is_write_target")
        }

        @Test
        fun `V10 creates the partial unique write-target index`() {
            val indexes =
                jdbc.queryForList(
                    "SELECT indexname FROM pg_indexes WHERE tablename = 'calendar_subscriptions'",
                    String::class.java,
                )
            assertThat(indexes).contains("idx_calendar_subscriptions_write_target")
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.CalendarFlagsMigrationTest"`
Expected: FAIL — columns/index do not exist yet.

- [ ] **Step 3: Write the migration**

`backend/src/main/resources/db/migration/V10__calendar_flags.sql`
```sql
-- V10: shared/write-target flags per calendar subscription
ALTER TABLE calendar_subscriptions
    ADD COLUMN is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_write_target BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: the existing Google primary calendar becomes the write target per connection.
UPDATE calendar_subscriptions SET is_write_target = TRUE WHERE is_primary = TRUE;

-- Exactly one write target per connection.
CREATE UNIQUE INDEX idx_calendar_subscriptions_write_target
    ON calendar_subscriptions (connection_id) WHERE is_write_target = TRUE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.CalendarFlagsMigrationTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V10__calendar_flags.sql \
        backend/src/test/kotlin/com/familyhub/google/CalendarFlagsMigrationTest.kt
git commit -m "feat(calendar): V10 adds is_shared/is_write_target flags with partial unique index"
```

---

## Task 2: Entity flags + repository method + index enforcement

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscription.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscriptionRepository.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSubscriptionFlagsIntegrationTest.kt`

**Interfaces:**
- Consumes: Task 1 columns/index.
- Produces: `CalendarSubscription.isShared: Boolean`, `CalendarSubscription.isWriteTarget: Boolean`; `CalendarSubscriptionRepository.findAllByIsSharedTrue(): List<CalendarSubscription>`.

- [ ] **Step 1: Write the failing test** (persists a member + connection + two subscriptions; the second write-target must violate the partial unique index)

`backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSubscriptionFlagsIntegrationTest.kt`
```kotlin
package com.familyhub.google.calendar

import com.familyhub.BaseIntegrationTest
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException

class CalendarSubscriptionFlagsIntegrationTest
    @Autowired
    constructor(
        private val members: FamilyMemberRepository,
        private val connections: GoogleConnectionRepository,
        private val subscriptions: CalendarSubscriptionRepository,
    ) : BaseIntegrationTest() {
        private fun connection(): GoogleConnection {
            val member = members.save(FamilyMember(name = "Papa", role = "parent", color = "green"))
            return connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!,
                    credentialsId = null,
                    googleAccountId = "acc-${member.id}",
                    email = "papa@example.com",
                    accessToken = null,
                    refreshToken = "refresh",
                    tokenExpiresAt = null,
                    status = "active",
                ),
            )
        }

        @Test
        fun `flags default to false and persist true`() {
            val conn = connection()
            val saved =
                subscriptions.save(
                    CalendarSubscription(
                        connectionId = conn.id!!,
                        googleCalendarId = "cal-a",
                        summary = "A",
                        isShared = true,
                        isWriteTarget = true,
                    ),
                )
            val reloaded = subscriptions.findById(saved.id!!).get()
            assertThat(reloaded.isShared).isTrue()
            assertThat(reloaded.isWriteTarget).isTrue()
        }

        @Test
        fun `findAllByIsSharedTrue returns only shared subscriptions`() {
            val conn = connection()
            subscriptions.save(CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "s", summary = "S", isShared = true))
            subscriptions.save(CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "p", summary = "P", isShared = false))
            assertThat(subscriptions.findAllByIsSharedTrue().map { it.googleCalendarId }).containsExactly("s")
        }

        @Test
        fun `a second write target on the same connection is rejected`() {
            val conn = connection()
            subscriptions.save(CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "cal-1", summary = "1", isWriteTarget = true))
            assertThatThrownBy {
                subscriptions.saveAndFlush(
                    CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "cal-2", summary = "2", isWriteTarget = true),
                )
            }.isInstanceOf(DataIntegrityViolationException::class.java)
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarSubscriptionFlagsIntegrationTest"`
Expected: FAIL — `isShared`/`isWriteTarget`/`findAllByIsSharedTrue` do not compile/exist.

- [ ] **Step 3: Add the entity fields**

In `CalendarSubscription.kt`, add two constructor properties directly after `isSelected` (keep the `@Column` style of the neighbours):
```kotlin
    @Column(name = "is_selected", nullable = false)
    var isSelected: Boolean = false,
    @Column(name = "is_shared", nullable = false)
    var isShared: Boolean = false,
    @Column(name = "is_write_target", nullable = false)
    var isWriteTarget: Boolean = false,
```

- [ ] **Step 4: Add the repository method**

In `CalendarSubscriptionRepository.kt`, add:
```kotlin
    fun findAllByIsSharedTrue(): List<CalendarSubscription>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarSubscriptionFlagsIntegrationTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscription.kt \
        backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSubscriptionRepository.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSubscriptionFlagsIntegrationTest.kt
git commit -m "feat(calendar): CalendarSubscription flags + findAllByIsSharedTrue"
```

---

## Task 3: Backend color palettes (member + shared)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/MemberColorPalette.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/SharedCalendarPalette.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/ColorPaletteTest.kt`

**Interfaces:**
- Produces:
  - `MemberColorPalette.hex(token: String?): String` — Token→HSL, Default `blue` bei null/unbekannt.
  - `SharedCalendarPalette.COLORS: List<String>`; `SharedCalendarPalette.colorFor(calendarId: String, sharedOrder: List<String>): String` — Index aus `sharedOrder`, Modulo über `COLORS`.

- [ ] **Step 1: Write the failing test**

`backend/src/test/kotlin/com/familyhub/google/calendar/ColorPaletteTest.kt`
```kotlin
package com.familyhub.google.calendar

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ColorPaletteTest {
    @Test
    fun `member palette maps known token to its hsl`() {
        assertThat(MemberColorPalette.hex("green")).isEqualTo("hsl(140 60% 65%)")
    }

    @Test
    fun `member palette falls back to blue for null or unknown token`() {
        assertThat(MemberColorPalette.hex(null)).isEqualTo("hsl(210 80% 70%)")
        assertThat(MemberColorPalette.hex("chartreuse")).isEqualTo("hsl(210 80% 70%)")
    }

    @Test
    fun `shared palette picks by position in the sorted shared order`() {
        val order = listOf("a-cal", "b-cal", "c-cal")
        assertThat(SharedCalendarPalette.colorFor("a-cal", order)).isEqualTo(SharedCalendarPalette.COLORS[0])
        assertThat(SharedCalendarPalette.colorFor("b-cal", order)).isEqualTo(SharedCalendarPalette.COLORS[1])
    }

    @Test
    fun `shared palette wraps around with modulo`() {
        val order = (0..SharedCalendarPalette.COLORS.size).map { "cal-$it" }
        // the (size+1)-th shared calendar wraps back to COLORS[0]
        val wrapping = order.last()
        assertThat(SharedCalendarPalette.colorFor(wrapping, order))
            .isEqualTo(SharedCalendarPalette.COLORS[SharedCalendarPalette.COLORS.size % SharedCalendarPalette.COLORS.size])
    }

    @Test
    fun `shared palette is deterministic for the same calendar id across callers`() {
        val order = listOf("holidays", "birthdays", "school")
        assertThat(SharedCalendarPalette.colorFor("birthdays", order))
            .isEqualTo(SharedCalendarPalette.colorFor("birthdays", order))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.ColorPaletteTest"`
Expected: FAIL — palettes do not exist.

- [ ] **Step 3: Write `MemberColorPalette`** (HSL values copied verbatim from `frontend/src/features/members/colors.ts`)

`backend/src/main/kotlin/com/familyhub/google/calendar/MemberColorPalette.kt`
```kotlin
package com.familyhub.google.calendar

/**
 * Personenfarben je Mitglieds-Token. Die HSL-Werte MÜSSEN identisch zu
 * `frontend/src/features/members/colors.ts` (MEMBER_COLORS) sein, damit ein
 * persönlicher Kalender exakt die Avatarfarbe seines Mitglieds trägt.
 */
object MemberColorPalette {
    val COLORS =
        mapOf(
            "blue" to "hsl(210 80% 70%)",
            "pink" to "hsl(340 75% 75%)",
            "green" to "hsl(140 60% 65%)",
            "purple" to "hsl(270 60% 70%)",
            "orange" to "hsl(30 85% 65%)",
            "teal" to "hsl(180 55% 60%)",
        )

    fun hex(token: String?): String = COLORS[token] ?: COLORS.getValue("blue")
}
```

- [ ] **Step 4: Write `SharedCalendarPalette`**

`backend/src/main/kotlin/com/familyhub/google/calendar/SharedCalendarPalette.kt`
```kotlin
package com.familyhub.google.calendar

/**
 * Farben für geteilte/Familien-Kalender. Bewusst kräftiger/anders als die
 * pastellige Mitglieds-Palette, damit "nicht Person" sofort erkennbar ist.
 * Die Zuordnung ist deterministisch: geteilte Kalender werden global stabil
 * nach google_calendar_id sortiert; der Index (modulo Palettengröße) wählt die
 * Farbe. Derselbe geteilte Kalender bekommt so bei jedem Konto dieselbe Farbe.
 */
object SharedCalendarPalette {
    val COLORS =
        listOf(
            "hsl(45 90% 55%)", // Bernstein
            "hsl(0 0% 62%)", // Neutralgrau
            "hsl(255 35% 58%)", // Indigo
            "hsl(160 45% 45%)", // Smaragd
            "hsl(15 68% 55%)", // Terrakotta
            "hsl(205 25% 52%)", // Stahlblau
        )

    fun colorFor(
        calendarId: String,
        sharedOrder: List<String>,
    ): String {
        val idx = sharedOrder.indexOf(calendarId).let { if (it < 0) 0 else it }
        return COLORS[idx % COLORS.size]
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.ColorPaletteTest"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/MemberColorPalette.kt \
        backend/src/main/kotlin/com/familyhub/google/calendar/SharedCalendarPalette.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/ColorPaletteTest.kt
git commit -m "feat(calendar): member + shared color palettes"
```

---

## Task 4: CalendarColorResolver

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarColorResolver.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarColorResolverTest.kt`

**Interfaces:**
- Consumes: `MemberColorPalette`, `SharedCalendarPalette` (Task 3); `CalendarSubscriptionRepository.findAllByIsSharedTrue()` (Task 2); `GoogleConnectionRepository.findById`, `FamilyMemberRepository.findById`.
- Produces: `CalendarColorResolver.colorFor(subscription: CalendarSubscription): String`.

- [ ] **Step 1: Write the failing test**

`backend/src/test/kotlin/com/familyhub/google/calendar/CalendarColorResolverTest.kt`
```kotlin
package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class CalendarColorResolverTest {
    private val subscriptionRepository = mockk<CalendarSubscriptionRepository>()
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val resolver = CalendarColorResolver(subscriptionRepository, connectionRepository, memberRepository)

    private val memberId = UUID.randomUUID()
    private val connectionId = UUID.randomUUID()

    private fun sub(calId: String, shared: Boolean) =
        CalendarSubscription(connectionId = connectionId, googleCalendarId = calId, summary = calId, isShared = shared)

    @Test
    fun `personal calendar inherits the member color`() {
        val connection =
            GoogleConnection(
                familyMemberId = memberId, credentialsId = null, googleAccountId = "g", email = "e",
                accessToken = null, refreshToken = "r", tokenExpiresAt = null, status = "active",
            ).also { it.id = connectionId }
        val member = FamilyMember(name = "Papa", role = "parent", color = "green").also { it.id = memberId }
        every { connectionRepository.findById(connectionId) } returns Optional.of(connection)
        every { memberRepository.findById(memberId) } returns Optional.of(member)

        assertThat(resolver.colorFor(sub("personal", shared = false))).isEqualTo("hsl(140 60% 65%)")
    }

    @Test
    fun `shared calendar gets a shared-palette color by global sorted order`() {
        every { subscriptionRepository.findAllByIsSharedTrue() } returns
            listOf(sub("birthdays", true), sub("holidays", true)) // sorted → birthdays[0], holidays[1]

        assertThat(resolver.colorFor(sub("holidays", shared = true))).isEqualTo(SharedCalendarPalette.COLORS[1])
    }

    @Test
    fun `same shared calendar id resolves to the same color regardless of connection`() {
        every { subscriptionRepository.findAllByIsSharedTrue() } returns
            listOf(
                CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true),
                CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true),
            )
        val a = CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true)
        val b = CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true)

        assertThat(resolver.colorFor(a)).isEqualTo(resolver.colorFor(b))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarColorResolverTest"`
Expected: FAIL — `CalendarColorResolver` does not exist.

- [ ] **Step 3: Write the resolver**

`backend/src/main/kotlin/com/familyhub/google/calendar/CalendarColorResolver.kt`
```kotlin
package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMemberRepository
import org.springframework.stereotype.Service

/**
 * Löst die anzuzeigende Farbe je Kalender-Subscription auf:
 * - geteilt  → deterministische Farbe aus der Shared-Palette
 * - sonst    → Farbe des Konto-Mitglieds (connection → member → member.color)
 */
@Service
class CalendarColorResolver(
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val memberRepository: FamilyMemberRepository,
) {
    fun colorFor(subscription: CalendarSubscription): String =
        if (subscription.isShared) {
            SharedCalendarPalette.colorFor(subscription.googleCalendarId, sharedOrder())
        } else {
            val token =
                connectionRepository.findById(subscription.connectionId).orElse(null)
                    ?.let { memberRepository.findById(it.familyMemberId).orElse(null)?.color }
            MemberColorPalette.hex(token)
        }

    private fun sharedOrder(): List<String> =
        subscriptionRepository.findAllByIsSharedTrue()
            .map { it.googleCalendarId }
            .distinct()
            .sorted()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarColorResolverTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarColorResolver.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/CalendarColorResolverTest.kt
git commit -m "feat(calendar): CalendarColorResolver resolves per-calendar color"
```

---

## Task 5: Scheduler discovery — `syncConnection` refreshes calendars first

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSyncService.kt:66`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSyncServiceTest.kt`

**Interfaces:**
- Consumes: existing `refreshCalendars(connection)`, `GoogleCalendarClient.listCalendars(connection)`.
- Produces: `syncConnection` calls `refreshCalendars` before iterating selected subscriptions (fixes background discovery for every account).

- [ ] **Step 1: Write the failing test** (append to `CalendarSyncServiceTest`)

```kotlin
    @Test
    fun `syncConnection discovers calendars via refreshCalendars before syncing`() {
        every { calendarClient.listCalendars(activeConnection) } returns emptyList()
        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns emptyList()
        every { connectionRepo.save(activeConnection) } returns activeConnection

        service.syncConnection(activeConnection)

        verify(exactly = 1) { calendarClient.listCalendars(activeConnection) }
    }

    @Test
    fun `syncConnection does not discover calendars for an inactive connection`() {
        service.syncConnection(inactiveConnection)

        verify(exactly = 0) { calendarClient.listCalendars(any()) }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarSyncServiceTest"`
Expected: FAIL on the first new test — `listCalendars` not invoked by `syncConnection`.

- [ ] **Step 3: Insert the refresh call** in `CalendarSyncService.syncConnection`, immediately after the active-status guard:

```kotlin
    fun syncConnection(connection: GoogleConnection): SyncResult {
        if (connection.status != "active") {
            return SyncResult(0, 0, 0)
        }

        // Discover (and upsert) this account's calendars so newly-connected accounts
        // sync even without a prior UI visit. refreshCalendars never flips isSelected.
        refreshCalendars(connection)

        val connectionId = connection.id!!
        val subscriptions = subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId)
        // … unchanged …
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarSyncServiceTest"`
Expected: PASS (all existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSyncService.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/CalendarSyncServiceTest.kt
git commit -m "fix(calendar): syncConnection discovers calendars before syncing (scheduler)"
```

---

## Task 6: EventService writes to the write-target calendar

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt:121`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventServiceTest.kt`

**Interfaces:**
- Consumes: `CalendarSubscription.isWriteTarget` (Task 2).
- Produces: `create` selects the target subscription as `firstOrNull { it.isWriteTarget } ?: firstOrNull { it.isPrimary }` when no explicit `calendarId` is given (explicit `calendarId` still wins; existing primary-fallback behaviour preserved).

- [ ] **Step 1: Write the failing test** (append to `EventServiceTest`)

```kotlin
    @Test
    fun `create with null calendarId prefers the write-target over the primary`() {
        val writeTarget =
            CalendarSubscription(
                connectionId = connectionId,
                googleCalendarId = "writetarget@gmail.com",
                summary = "Write Target",
                isPrimary = false,
                isSelected = true,
                isWriteTarget = true,
            ).also { it.id = UUID.randomUUID() }
        val googleInserted = GoogleEvent().setId("google-evt-new").setSummary("Meeting")
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findAllByConnectionId(connectionId) } returns listOf(primarySubscription, writeTarget)
        every { calendarClient.insertEvent(connection, "writetarget@gmail.com", any()) } returns googleInserted
        every { eventRepository.save(any<Event>()) } answers { firstArg<Event>().also { it.id = UUID.randomUUID() } }

        val cmd =
            CreateEventCommand(
                memberId = memberId, calendarId = null, title = "Meeting",
                start = startTime, end = endTime, isAllDay = false,
            )

        val result = service.create(cmd)

        assertThat(result.calendarId).isEqualTo("writetarget@gmail.com")
        verify(exactly = 1) { calendarClient.insertEvent(connection, "writetarget@gmail.com", any()) }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.EventServiceTest"`
Expected: FAIL — event is inserted into the primary, not the write-target.

- [ ] **Step 3: Change the selection** in `EventService.create` (the `else` branch):

```kotlin
        val target: CalendarSubscription =
            if (cmd.calendarId != null) {
                subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connection.id!!, cmd.calendarId)
                    ?: throw ValidationException("Kalender nicht gefunden")
            } else {
                val subs = subscriptionRepository.findAllByConnectionId(connection.id!!)
                subs.firstOrNull { it.isWriteTarget }
                    ?: subs.firstOrNull { it.isPrimary }
                    ?: throw ValidationException("Kein Zielkalender vorhanden")
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.EventServiceTest"`
Expected: PASS (existing `create with null calendarId uses primary subscription` still green — that fixture has no write-target, so the primary fallback applies).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/EventServiceTest.kt
git commit -m "feat(calendar): new events target the write-target calendar"
```

---

## Task 7: OAuth forces account selection

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt:56`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt`

**Interfaces:**
- Produces: authorization URL carries `prompt=select_account consent` (URL-encoded `select_account%20consent`).

- [ ] **Step 1: Update the existing test** — replace the `prompt=consent` assertion in `authorization url carries pkce and offline params`:

```kotlin
    @Test fun `authorization url carries pkce and offline params`() {
        val url = flow.buildAuthorizationUrl("cid", "http://localhost:8080/oauth/callback", "state123", "challengeXYZ")
        assertThat(url).contains(
            "code_challenge=challengeXYZ",
            "code_challenge_method=S256",
            "access_type=offline",
            "prompt=select_account%20consent",
            "state=state123",
            "client_id=cid",
        )
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.GoogleOAuthFlowTest"`
Expected: FAIL — URL still contains `prompt=consent`.

- [ ] **Step 3: Change the query param** in `GoogleOAuthFlow.buildAuthorizationUrl`:

```kotlin
            .queryParam("prompt", "select_account consent")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.oauth.GoogleOAuthFlowTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt \
        backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt
git commit -m "feat(oauth): prompt=select_account so a second account can be connected"
```

---

## Task 8: API contract — CalendarResponse fields, aggregate + flags endpoints

**Files:**
- Modify: `api/openapi.yml`

**Interfaces:**
- Produces (generated on both sides):
  - `CalendarResponse` gains required `color: string`, `isShared: boolean`, `isWriteTarget: boolean`, `ownerMemberId: string (uuid)`.
  - `GET /v1/google/calendars/all` → `listAllCalendars` → `List<CalendarResponse>`.
  - `PUT /v1/google/calendars/flags` → `updateCalendarFlags`, body `CalendarFlagsRequest`.
  - `CalendarFlagsRequest { memberId: uuid, calendarId: string, isShared?: boolean, isWriteTarget?: boolean }`.

- [ ] **Step 1: Extend `CalendarResponse`** — replace the schema block (currently `required: [id, summary, isPrimary, isSelected]`) with:

```yaml
    CalendarResponse:
      type: object
      required: [id, summary, isPrimary, isSelected, color, isShared, isWriteTarget, ownerMemberId]
      properties:
        id:
          type: string
          description: Google calendar ID
        summary:
          type: string
        backgroundColor:
          type: string
          nullable: true
        isPrimary:
          type: boolean
        isSelected:
          type: boolean
        color:
          type: string
          description: Resolved display color (member or shared palette)
        isShared:
          type: boolean
        isWriteTarget:
          type: boolean
        ownerMemberId:
          type: string
          format: uuid
```

- [ ] **Step 2: Add the two paths** — directly after the `/v1/google/calendars/sync` path block (before `/v1/events`):

```yaml
  /v1/google/calendars/all:
    get:
      operationId: listAllCalendars
      summary: List calendars across all connected accounts with resolved colors
      tags: [GoogleCalendars]
      security: []
      responses:
        "200":
          description: All calendars across all connections
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/CalendarResponse"

  /v1/google/calendars/flags:
    put:
      operationId: updateCalendarFlags
      summary: Set shared / write-target flags on a calendar (PIN-protected)
      tags: [GoogleCalendars]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CalendarFlagsRequest"
      responses:
        "200":
          description: Flags updated
```

- [ ] **Step 3: Add the request schema** — directly after `SelectedCalendarsRequest`:

```yaml
    CalendarFlagsRequest:
      type: object
      required: [memberId, calendarId]
      properties:
        memberId:
          type: string
          format: uuid
        calendarId:
          type: string
        isShared:
          type: boolean
          nullable: true
        isWriteTarget:
          type: boolean
          nullable: true
```

- [ ] **Step 4: Regenerate both clients and verify the spec compiles**

Run:
```bash
cd backend && ./gradlew openApiGenerate
cd ../frontend && npm run generate:api
```
Expected: both succeed; generated `GoogleCalendarsApi` (Kotlin) now declares `listAllCalendars` + `updateCalendarFlags`, and `frontend/src/api/generated` exposes `useListAllCalendars`, `useUpdateCalendarFlags`, `getListAllCalendarsQueryKey`, and a `CalendarFlagsRequest` model. (Generated files are gitignored — do not stage them.)

> Note: adding response fields and new operations is backward-compatible. If CI's `oasdiff` flags anything, the change is additive — no `breaking-change` label needed; confirm the report shows only `*-added` entries.

- [ ] **Step 5: Commit**

```bash
git add api/openapi.yml
git commit -m "feat(api): calendar color fields + aggregate list + flags endpoint"
```

---

## Task 9: CalendarQueryService — colors, aggregate list, flag updates

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarQueryService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarQueryServiceTest.kt`

**Interfaces:**
- Consumes: `CalendarColorResolver.colorFor` (Task 4); `GoogleConnectionRepository.findAllByStatus`; `CalendarSubscriptionRepository.{findAllByConnectionId, findByConnectionIdAndGoogleCalendarId, save}`.
- Produces:
  - `CalendarView` gains `color: String`, `isShared: Boolean`, `isWriteTarget: Boolean`, `ownerMemberId: UUID`.
  - `CalendarQueryService.listAll(): List<CalendarView>` — all active connections, DB read (no Google refresh).
  - `CalendarQueryService.updateFlags(memberId: UUID, calendarId: String, isShared: Boolean?, isWriteTarget: Boolean?)`.

- [ ] **Step 1: Write the failing tests.** First open `CalendarQueryServiceTest.kt` and add a resolver mock to the fixture: declare `private val colorResolver = mockk<CalendarColorResolver>()`, pass it as the 4th constructor arg to `CalendarQueryService(...)`, and in existing setup add `every { colorResolver.colorFor(any()) } returns "hsl(140 60% 65%)"`. Then append:

```kotlin
    @Test
    fun `listAll aggregates calendars across all active connections with resolved color`() {
        val conn1 = connectionWith(UUID.randomUUID())
        val conn2 = connectionWith(UUID.randomUUID())
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn1, conn2)
        every { subscriptionRepository.findAllByConnectionId(conn1.id!!) } returns
            listOf(CalendarSubscription(connectionId = conn1.id!!, googleCalendarId = "a", summary = "A", isSelected = true))
        every { subscriptionRepository.findAllByConnectionId(conn2.id!!) } returns
            listOf(CalendarSubscription(connectionId = conn2.id!!, googleCalendarId = "b", summary = "B", isShared = true))

        val result = service.listAll()

        assertThat(result.map { it.id }).containsExactly("a", "b")
        assertThat(result[0].ownerMemberId).isEqualTo(conn1.familyMemberId)
        assertThat(result[0].color).isEqualTo("hsl(140 60% 65%)")
    }

    @Test
    fun `updateFlags sets isShared and moves the write target exclusively`() {
        val conn = connectionWith(UUID.randomUUID())
        val old = CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "old", summary = "Old", isWriteTarget = true).also { it.id = UUID.randomUUID() }
        val target = CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "new", summary = "New").also { it.id = UUID.randomUUID() }
        every { connectionRepository.findByFamilyMemberId(conn.familyMemberId) } returns conn
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(conn.id!!, "new") } returns target
        every { subscriptionRepository.findAllByConnectionId(conn.id!!) } returns listOf(old, target)
        every { subscriptionRepository.save(any()) } answers { firstArg() }

        service.updateFlags(conn.familyMemberId, "new", isShared = true, isWriteTarget = true)

        assertThat(target.isShared).isTrue()
        assertThat(target.isWriteTarget).isTrue()
        assertThat(old.isWriteTarget).isFalse()
    }

    @Test
    fun `updateFlags throws when the calendar is unknown`() {
        val conn = connectionWith(UUID.randomUUID())
        every { connectionRepository.findByFamilyMemberId(conn.familyMemberId) } returns conn
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(conn.id!!, "ghost") } returns null

        assertThatThrownBy { service.updateFlags(conn.familyMemberId, "ghost", isShared = true, isWriteTarget = null) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }
```

Add this helper to the test class (and the imports `com.familyhub.google.connection.GoogleConnection`, `org.assertj.core.api.Assertions.assertThatThrownBy`, `com.familyhub.shared.exceptions.ResourceNotFoundException` if not present):

```kotlin
    private fun connectionWith(memberId: UUID) =
        GoogleConnection(
            familyMemberId = memberId, credentialsId = null, googleAccountId = "g-$memberId", email = "e",
            accessToken = null, refreshToken = "r", tokenExpiresAt = null, status = "active",
        ).also { it.id = UUID.randomUUID() }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarQueryServiceTest"`
Expected: FAIL — `listAll`/`updateFlags` and the new `CalendarView` fields do not exist.

- [ ] **Step 3: Rewrite `CalendarQueryService.kt`**

```kotlin
package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import java.util.UUID

data class CalendarView(
    val id: String,
    val summary: String,
    val backgroundColor: String?,
    val isPrimary: Boolean,
    val isSelected: Boolean,
    val color: String,
    val isShared: Boolean,
    val isWriteTarget: Boolean,
    val ownerMemberId: UUID,
)

@Service
class CalendarQueryService(
    private val connectionRepository: GoogleConnectionRepository,
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val calendarSyncService: CalendarSyncService,
    private val colorResolver: CalendarColorResolver,
) {
    private fun CalendarSubscription.toView(ownerMemberId: UUID) =
        CalendarView(
            id = googleCalendarId,
            summary = summary,
            backgroundColor = backgroundColor,
            isPrimary = isPrimary,
            isSelected = isSelected,
            color = colorResolver.colorFor(this),
            isShared = isShared,
            isWriteTarget = isWriteTarget,
            ownerMemberId = ownerMemberId,
        )

    fun listForMember(memberId: UUID): List<CalendarView> {
        val connection = connectionRepository.findByFamilyMemberId(memberId) ?: return emptyList()
        calendarSyncService.refreshCalendars(connection)
        return subscriptionRepository.findAllByConnectionId(connection.id!!)
            .map { it.toView(connection.familyMemberId) }
    }

    fun listAll(): List<CalendarView> =
        connectionRepository.findAllByStatus("active").flatMap { connection ->
            subscriptionRepository.findAllByConnectionId(connection.id!!)
                .map { it.toView(connection.familyMemberId) }
        }

    fun saveSelection(
        memberId: UUID,
        calendarIds: List<String>,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val subscriptions = subscriptionRepository.findAllByConnectionId(connection.id!!)
        for (subscription in subscriptions) {
            subscription.isSelected = subscription.googleCalendarId in calendarIds
            subscriptionRepository.save(subscription)
        }
    }

    fun updateFlags(
        memberId: UUID,
        calendarId: String,
        isShared: Boolean?,
        isWriteTarget: Boolean?,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val target =
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connection.id!!, calendarId)
                ?: throw ResourceNotFoundException("Kalender nicht gefunden")
        if (isShared != null) target.isShared = isShared
        if (isWriteTarget == true) {
            subscriptionRepository.findAllByConnectionId(connection.id!!)
                .filter { it.isWriteTarget && it.id != target.id }
                .forEach {
                    it.isWriteTarget = false
                    subscriptionRepository.save(it)
                }
            target.isWriteTarget = true
        } else if (isWriteTarget == false) {
            target.isWriteTarget = false
        }
        subscriptionRepository.save(target)
    }

    fun syncForMember(memberId: UUID): SyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return calendarSyncService.syncConnection(connection)
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarQueryServiceTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarQueryService.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/CalendarQueryServiceTest.kt
git commit -m "feat(calendar): query service resolves colors, aggregate list, flag updates"
```

---

## Task 10: CalendarController — aggregate + flags endpoints

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/CalendarControllerTest.kt`

**Interfaces:**
- Consumes: generated `GoogleCalendarsApi.listAllCalendars`, `GoogleCalendarsApi.updateCalendarFlags`, model `CalendarFlagsRequest` (Task 8); `CalendarQueryService.{listAll, updateFlags}` (Task 9).
- Produces: `GET /api/v1/google/calendars/all`, `PUT /api/v1/google/calendars/flags` (`@RequiresPinSession`), and `CalendarResponse` now carries `color`/`isShared`/`isWriteTarget`/`ownerMemberId`.

- [ ] **Step 1: Update the existing controller test.** In `CalendarControllerTest`, every `CalendarView(...)` construction now needs the four new fields — update both entries in `GET calendars returns 200 …` (add `color = "hsl(140 60% 65%)", isShared = false, isWriteTarget = true, ownerMemberId = memberId` to the first and matching values to the second). Then append new tests:

```kotlin
    // ─── GET /v1/google/calendars/all ─────────────────────────────────────────

    @Test
    fun `GET all calendars returns aggregated list with resolved color`() {
        every { service.listAll() } returns
            listOf(
                CalendarView(
                    id = "cal1@gmail.com", summary = "Family", backgroundColor = null,
                    isPrimary = true, isSelected = true, color = "hsl(45 90% 55%)",
                    isShared = true, isWriteTarget = false, ownerMemberId = memberId,
                ),
            )

        mockMvc.get("/api/v1/google/calendars/all").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("cal1@gmail.com") }
            jsonPath("$[0].color") { value("hsl(45 90% 55%)") }
            jsonPath("$[0].isShared") { value(true) }
            jsonPath("$[0].ownerMemberId") { value(memberId.toString()) }
        }
    }

    // ─── PUT /v1/google/calendars/flags ───────────────────────────────────────

    @Test
    fun `PUT flags returns 200`() {
        justRun { service.updateFlags(memberId, "cal1@gmail.com", true, true) }

        mockMvc.put("/api/v1/google/calendars/flags") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"memberId":"$memberId","calendarId":"cal1@gmail.com","isShared":true,"isWriteTarget":true}"""
        }.andExpect {
            status { isOk() }
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarControllerTest"`
Expected: FAIL — new endpoints not implemented (and, after Step 1 edits, the controller must compile against the extended `CalendarView`).

- [ ] **Step 3: Implement the controller methods.** Rewrite `CalendarController.kt`:

```kotlin
package com.familyhub.google.calendar

import com.familyhub.generated.api.GoogleCalendarsApi
import com.familyhub.generated.model.CalendarFlagsRequest
import com.familyhub.generated.model.CalendarResponse
import com.familyhub.generated.model.SelectedCalendarsRequest
import com.familyhub.generated.model.SyncResultResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class CalendarController(
    private val service: CalendarQueryService,
) : GoogleCalendarsApi {
    override fun listGoogleCalendars(memberId: UUID): ResponseEntity<List<CalendarResponse>> =
        ResponseEntity.ok(service.listForMember(memberId).map { it.toResponse() })

    override fun listAllCalendars(): ResponseEntity<List<CalendarResponse>> =
        ResponseEntity.ok(service.listAll().map { it.toResponse() })

    @RequiresPinSession
    override fun saveSelectedCalendars(selectedCalendarsRequest: SelectedCalendarsRequest): ResponseEntity<Unit> {
        service.saveSelection(selectedCalendarsRequest.memberId, selectedCalendarsRequest.calendarIds)
        return ResponseEntity.ok().build()
    }

    @RequiresPinSession
    override fun updateCalendarFlags(calendarFlagsRequest: CalendarFlagsRequest): ResponseEntity<Unit> {
        service.updateFlags(
            memberId = calendarFlagsRequest.memberId,
            calendarId = calendarFlagsRequest.calendarId,
            isShared = calendarFlagsRequest.isShared,
            isWriteTarget = calendarFlagsRequest.isWriteTarget,
        )
        return ResponseEntity.ok().build()
    }

    override fun syncCalendars(memberId: UUID): ResponseEntity<SyncResultResponse> {
        val r = service.syncForMember(memberId)
        return ResponseEntity.ok(SyncResultResponse(created = r.created, updated = r.updated, deleted = r.deleted))
    }
}

private fun CalendarView.toResponse() =
    CalendarResponse(
        id = id,
        summary = summary,
        isPrimary = isPrimary,
        isSelected = isSelected,
        color = color,
        isShared = isShared,
        isWriteTarget = isWriteTarget,
        ownerMemberId = ownerMemberId,
        backgroundColor = backgroundColor,
    )
```

> The exact generated method signature for `updateCalendarFlags` (parameter name) comes from the codegen in Task 8 — if the generated interface names the body parameter differently, match it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./gradlew test --tests "com.familyhub.google.calendar.CalendarControllerTest"`
Expected: PASS.

- [ ] **Step 5: Run the full backend gate**

Run: `cd backend && ./gradlew check`
Expected: PASS (ktlint + detekt + all tests + JaCoCo). Fix any coverage/lint gaps this surfaces before committing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar/CalendarController.kt \
        backend/src/test/kotlin/com/familyhub/google/calendar/CalendarControllerTest.kt
git commit -m "feat(calendar): aggregate list + PIN-protected flags endpoints"
```

---

## Task 11: Frontend — expose `calendarId` on CalendarEvent

**Files:**
- Modify: `frontend/src/features/calendar/useCalendarEvents.ts`
- Test: `frontend/src/features/calendar/useCalendarEvents.test.tsx`

**Interfaces:**
- Consumes: generated `EventResponse.calendarId` (already present).
- Produces: `CalendarEvent.calendarId: string`, populated by `toCalendarEvent`.

- [ ] **Step 1: Write the failing test.** Open `useCalendarEvents.test.tsx`, find an existing `toCalendarEvent` assertion block, and add:

```tsx
  it('maps calendarId from the response', () => {
    const event = toCalendarEvent({
      id: 'e1', title: 'T', memberId: 'm1', calendarId: 'cal-42',
      isAllDay: false, start: null, end: null, allDayStart: null, allDayEnd: null,
      reminderUseDefault: true, reminderMinutes: null, recurringEventId: null, recurrenceRule: null,
    } as never)
    expect(event.calendarId).toBe('cal-42')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/useCalendarEvents.test.tsx`
Expected: FAIL — `event.calendarId` is `undefined`.

- [ ] **Step 3: Add the field.** In `useCalendarEvents.ts`, add `calendarId: string` to the `CalendarEvent` interface (after `memberId`) and `calendarId: e.calendarId,` in `toCalendarEvent` (after `memberId: e.memberId,`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/calendar/useCalendarEvents.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/useCalendarEvents.ts \
        frontend/src/features/calendar/useCalendarEvents.test.tsx
git commit -m "feat(calendar): expose calendarId on CalendarEvent"
```

---

## Task 12: Frontend — aggregate calendars hook + flags mutation

**Files:**
- Modify: `frontend/src/features/google/useCalendars.ts`
- Test: `frontend/src/features/google/useCalendars.test.tsx` (create if absent)

**Interfaces:**
- Consumes: generated `useListAllCalendars`, `useUpdateCalendarFlags`, `getListAllCalendarsQueryKey`, `getListGoogleCalendarsQueryKey`, model `CalendarResponse` (Task 8).
- Produces: `useAllCalendars(): { calendars: CalendarResponse[]; isLoading; isError }`; `useUpdateCalendarFlagsMutation()`.

- [ ] **Step 1: Write the failing test**

`frontend/src/features/google/useCalendars.test.tsx`
```tsx
import { vi, describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

const useListAllCalendars = vi.fn()
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListGoogleCalendars: vi.fn(),
  useSaveSelectedCalendars: vi.fn(),
  useSyncCalendars: vi.fn(),
  useListAllCalendars: () => useListAllCalendars(),
  useUpdateCalendarFlags: vi.fn(() => ({ mutateAsync: vi.fn() })),
  getListGoogleCalendarsQueryKey: () => ['cal'],
  getListConnectionsQueryKey: () => ['conn'],
  getListAllCalendarsQueryKey: () => ['all'],
  authorizeGoogle: vi.fn(),
  useGoogleCallback: vi.fn(),
}))

import { useAllCalendars } from './useCalendars'

describe('useAllCalendars', () => {
  it('unwraps the calendars array', () => {
    useListAllCalendars.mockReturnValue({ data: { data: [{ id: 'a', color: 'hsl(1 1% 1%)' }] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useAllCalendars())
    expect(result.current.calendars).toEqual([{ id: 'a', color: 'hsl(1 1% 1%)' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/google/useCalendars.test.tsx`
Expected: FAIL — `useAllCalendars` is not exported.

- [ ] **Step 3: Add the hooks.** In `useCalendars.ts`, extend the import from `familyHubAPI` with `useListAllCalendars`, `useUpdateCalendarFlags`, `getListAllCalendarsQueryKey`, then add:

```ts
export function useAllCalendars() {
  const query = useListAllCalendars()
  return {
    calendars: (query.data?.data ?? []) as CalendarResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useUpdateCalendarFlagsMutation() {
  const queryClient = useQueryClient()
  return useUpdateCalendarFlags({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListGoogleCalendarsQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getListAllCalendarsQueryKey() })
      },
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/google/useCalendars.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/useCalendars.ts \
        frontend/src/features/google/useCalendars.test.tsx
git commit -m "feat(calendar): useAllCalendars + useUpdateCalendarFlagsMutation hooks"
```

---

## Task 13: Frontend — color events by calendar

**Files:**
- Modify: `frontend/src/features/calendar/WeekGrid.tsx`, `DayGrid.tsx`, `AgendaList.tsx`, `CalendarView.tsx`
- Test: `frontend/src/features/calendar/WeekGrid.test.tsx`

**Interfaces:**
- Consumes: `CalendarEvent.calendarId` (Task 11); `useAllCalendars` (Task 12).
- Produces: `CalendarGridProps.calendarColors: Map<string, string>` (replaces `members`); events colored via `colors.get(event.calendarId) ?? '#888'`.

- [ ] **Step 1: Rewrite the WeekGrid tests** to pass a `calendarColors` map and assert per-calendar coloring. Replace the whole `WeekGrid.test.tsx` file with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekGrid } from './WeekGrid'
import { DayGrid } from './DayGrid'
import type { CalendarEvent } from './useCalendarEvents'

const anchor = new Date(2026, 6, 22, 12) // Wed in week Mon 20 – Sun 26
const calendarColors = new Map<string, string>([['cal-a', 'hsl(140 60% 65%)']])

const base = {
  memberId: 'm1',
  location: null,
  description: null,
  reminderUseDefault: true,
  reminderMinutes: null,
  recurringEventId: null,
}

const timed: CalendarEvent = {
  ...base, id: 'e1', title: 'Schule', calendarId: 'cal-a', isAllDay: false,
  start: new Date(2026, 6, 21, 9), end: new Date(2026, 6, 21, 10), allDayStart: null, allDayEnd: null,
}

const allDay: CalendarEvent = {
  ...base, id: 'e2', title: 'Urlaub Papa', calendarId: 'cal-a', isAllDay: true,
  start: null, end: null, allDayStart: '2026-07-21', allDayEnd: null,
}

describe('WeekGrid', () => {
  it('renders 7 weekday headers Monday..Sunday', () => {
    render(<WeekGrid anchor={anchor} events={[]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByText(/Mo 20/)).toBeInTheDocument()
    expect(screen.getByText(/So 26/)).toBeInTheDocument()
  })

  it('colors a timed event by its calendar color', () => {
    render(<WeekGrid anchor={anchor} events={[timed]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toHaveStyle({ backgroundColor: 'hsl(140 60% 65%)' })
  })

  it('falls back to grey for an event whose calendar is unknown', () => {
    render(<WeekGrid anchor={anchor} events={[{ ...timed, calendarId: 'ghost' }]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toHaveStyle({ backgroundColor: '#888' })
  })

  it('renders an all-day event as a chip and fires onEventClick', async () => {
    const onEventClick = vi.fn()
    render(<WeekGrid anchor={anchor} events={[allDay]} calendarColors={calendarColors} now={anchor} onEventClick={onEventClick} onSlotClick={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Urlaub Papa' }))
    expect(onEventClick).toHaveBeenCalledWith(allDay)
  })

  it('excludes a non-all-day event that has no start time', () => {
    render(<WeekGrid anchor={anchor} events={[{ ...timed, start: null }]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Schule/ })).toBeNull()
  })
})

describe('DayGrid', () => {
  it('renders a single day and its timed event', () => {
    render(<DayGrid anchor={new Date(2026, 6, 21, 12)} events={[timed]} calendarColors={calendarColors} now={new Date(2026, 6, 21, 12)} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/WeekGrid.test.tsx`
Expected: FAIL — `calendarColors` prop unknown / helpers still key off `memberId`.

- [ ] **Step 3: Update `WeekGrid.tsx`.** Replace the imports/props/helpers header (lines 1–62) with:

```tsx
import { TimeGrid } from './TimeGrid'
import { DayColumn, type DayColumnItem } from './DayColumn'
import { AllDayRow, type AllDayChip } from './AllDayRow'
import {
  weekDays,
  weekdayHeader,
  isSameDayAs,
  allDaySpansDay,
} from './dates'
import type { CalendarEvent } from './useCalendarEvents'

export interface CalendarGridProps {
  anchor: Date
  events: CalendarEvent[]
  calendarColors: Map<string, string>
  now: Date
  onEventClick: (e: CalendarEvent) => void
  onSlotClick: (date: Date) => void
}

export function timedForDay(
  events: CalendarEvent[],
  day: Date,
  colors: Map<string, string>,
): DayColumnItem[] {
  return events
    .filter((e) => !e.isAllDay && e.start && isSameDayAs(e.start, day))
    .map((event) => ({ event, colorHex: colors.get(event.calendarId) ?? '#888' }))
}

export function allDayChipsForDay(
  events: CalendarEvent[],
  day: Date,
  colors: Map<string, string>,
  onEventClick: (e: CalendarEvent) => void,
): AllDayChip[] {
  return events
    .filter((e) => e.isAllDay && e.allDayStart && allDaySpansDay(e.allDayStart, e.allDayEnd, day))
    .map((event) => ({
      id: event.id,
      title: event.title,
      colorHex: colors.get(event.calendarId) ?? '#888',
      onClick: () => onEventClick(event),
    }))
}

export function WeekGrid({
  anchor,
  events,
  calendarColors,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const days = weekDays(anchor)
  const colors = calendarColors
```

(The JSX body from `return (` onward is unchanged.)

- [ ] **Step 4: Update `DayGrid.tsx`.** Change the import block to drop `buildColorMap` and use the prop:

```tsx
import { TimeGrid } from './TimeGrid'
import { DayColumn } from './DayColumn'
import { AllDayRow } from './AllDayRow'
import { weekdayHeader, isSameDayAs } from './dates'
import {
  timedForDay,
  allDayChipsForDay,
  type CalendarGridProps,
} from './WeekGrid'

export function DayGrid({
  anchor,
  events,
  calendarColors,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const colors = calendarColors

  const timed = timedForDay(events, anchor, colors)

  const chips = allDayChipsForDay(events, anchor, colors, onEventClick)
```

(The JSX body is unchanged.)

- [ ] **Step 5: Update `AgendaList.tsx`.** Replace the top imports (lines 1–6) and the component signature/color line:

```tsx
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { allDaySpansDay, formatTime } from './dates'
import type { CalendarGridProps } from './WeekGrid'
import type { CalendarEvent } from './useCalendarEvents'
```

and

```tsx
export function AgendaList({ events, calendarColors, now, onEventClick }: CalendarGridProps) {
  const colors = calendarColors
```

and change the per-event lookup (was `colors.get(e.memberId)`):

```tsx
              const color = colors.get(e.calendarId) ?? '#888'
```

- [ ] **Step 6: Update `CalendarView.tsx`** to build the calendar color map and pass it. Add the import and replace `gridProps`:

```tsx
import { useAllCalendars } from '@/features/google/useCalendars'
```

```tsx
  const { members } = useMembers()
  const { events, isLoading, isError, refetch } = useCalendarEvents(anchor, view)
  const { calendars } = useAllCalendars()
  const sync = useCalendarSync()

  const calendarColors = new Map(calendars.map((c) => [c.id, c.color]))

  const gridProps = {
    anchor,
    events,
    calendarColors,
    now,
    onEventClick: (event: CalendarEvent) => setDialog({ mode: 'edit', event }),
    onSlotClick: (date: Date) => setDialog({ mode: 'create', date }),
  }
```

(`members` is still used by `<EventDialog members={members} … />` below — keep it.)

- [ ] **Step 7: Run the frontend gate**

Run: `cd frontend && npm run check`
Expected: PASS — `tsc` confirms no stray `members`/`buildColorMap` references remain in the grids; eslint (`--max-warnings 0`), dependency-cruiser, and vitest all green. Fix any AgendaList/DayColumn snapshot or coverage gaps this surfaces.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/calendar/WeekGrid.tsx frontend/src/features/calendar/DayGrid.tsx \
        frontend/src/features/calendar/AgendaList.tsx frontend/src/features/calendar/CalendarView.tsx \
        frontend/src/features/calendar/WeekGrid.test.tsx
git commit -m "feat(calendar): color events by calendar via aggregated calendar colors"
```

---

## Task 14: Frontend — flag controls in "Kalender verwalten"

**Files:**
- Modify: `frontend/src/features/google/CalendarManagement.tsx`
- Test: `frontend/src/features/google/CalendarManagement.test.tsx`

**Interfaces:**
- Consumes: `useUpdateCalendarFlagsMutation` (Task 12); extended `CalendarResponse` (`color`, `isShared`, `isWriteTarget`).
- Produces: per calendar a **"Geteilt/Familie"** checkbox (`isShared`), a per-connection **"Primärkalender"** radio (`isWriteTarget`), and a resolved-`color` swatch — all PIN-gated.

- [ ] **Step 1: Update the test mock + add behavior tests.** In `CalendarManagement.test.tsx`, extend the `useCalendars` mock (line 8–11) with `useUpdateCalendarFlagsMutation: vi.fn()`, import it, and in `beforeEach` add `vi.mocked(useUpdateCalendarFlagsMutation).mockReturnValue({ mutateAsync: flagsMutate } as never)` with a module-level `const flagsMutate = vi.fn()` (and `flagsMutate.mockResolvedValue(undefined)`). Add `color`, `isShared`, `isWriteTarget` to `calendar1`/`calendar2` fixtures (e.g. `calendar1`: `color: 'hsl(140 60% 65%)', isShared: false, isWriteTarget: true`; `calendar2`: `color: 'hsl(45 90% 55%)', isShared: false, isWriteTarget: false`). Then add:

```tsx
  it('toggling "Geteilt" calls updateCalendarFlags with isShared', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection1], isLoading: false, isError: false })
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [calendar2], isLoading: false, isError: false })
    render(<CalendarManagement />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Geteilt/Familie' }))
    await waitFor(() =>
      expect(flagsMutate).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal2', isShared: true } }),
    )
  })

  it('selecting the primary radio calls updateCalendarFlags with isWriteTarget', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection1], isLoading: false, isError: false })
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [calendar2], isLoading: false, isError: false })
    render(<CalendarManagement />)
    fireEvent.click(screen.getByRole('radio', { name: 'Primärkalender' }))
    await waitFor(() =>
      expect(flagsMutate).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal2', isWriteTarget: true } }),
    )
  })

  it('flag controls are disabled without a PIN session', () => {
    hasPinSession = false
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection1], isLoading: false, isError: false })
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [calendar2], isLoading: false, isError: false })
    render(<CalendarManagement />)
    expect(screen.getByRole('checkbox', { name: 'Geteilt/Familie' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Primärkalender' })).toBeDisabled()
  })
```

> The existing swatch tests (`shows color swatch…`, `shows fallback color swatch…`) now assert the resolved `color`. Update them: the first expects `toHaveStyle({ backgroundColor: 'hsl(140 60% 65%)' })` for `calendar1`; delete the `.bg-slate-500` fallback test (there is no null-color fallback anymore — `color` is always present).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/google/CalendarManagement.test.tsx`
Expected: FAIL — the "Geteilt/Familie" checkbox and "Primärkalender" radio do not exist.

- [ ] **Step 3: Implement the controls.** In `CalendarManagement.tsx`, import the mutation and add flag handlers inside `ConnectionCalendars`:

```tsx
import { useCalendarsForMember, useSaveSelectedCalendarsMutation, useUpdateCalendarFlagsMutation } from '@/features/google/useCalendars'
```

Inside `ConnectionCalendars`, after `const saveMutation = …`:

```tsx
  const flagsMutation = useUpdateCalendarFlagsMutation()

  async function setShared(calendarId: string, isShared: boolean) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isShared } })
  }

  async function setWriteTarget(calendarId: string) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isWriteTarget: true } })
  }
```

Replace the `<li>` body (the swatch + selection label) with the color-preview swatch plus the three controls:

```tsx
            <li key={calendar.id} className="flex flex-wrap items-center gap-3">
              <span
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: calendar.color }}
                aria-hidden="true"
              />
              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(calendar.id)}
                  onChange={(e) => handleToggle(calendar.id, e.target.checked)}
                  disabled={!hasPinSession}
                  className="w-5 h-5"
                />
                {calendar.summary}
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Geteilt/Familie"
                  checked={calendar.isShared}
                  onChange={(e) => void setShared(calendar.id, e.target.checked)}
                  disabled={!hasPinSession}
                  className="w-5 h-5"
                />
                Geteilt
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  aria-label="Primärkalender"
                  name={`write-target-${connection.connectionId}`}
                  checked={calendar.isWriteTarget}
                  onChange={() => void setWriteTarget(calendar.id)}
                  disabled={!hasPinSession}
                  className="w-5 h-5"
                />
                Primär
              </label>
            </li>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/google/CalendarManagement.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/google/CalendarManagement.tsx \
        frontend/src/features/google/CalendarManagement.test.tsx
git commit -m "feat(calendar): shared + primary flag controls in Kalender verwalten"
```

---

## Task 15: Frontend — setup step iterates all connections

**Files:**
- Modify: `frontend/src/features/setup/CalendarSelectStep.tsx`
- Test: `frontend/src/features/setup/CalendarSelectStep.test.tsx`

**Interfaces:**
- Consumes: `useGoogleConnections`, `useCalendarsForMember`, `useSaveSelectedCalendarsMutation`.
- Produces: one selectable calendar block **per connection** (not just `connections[0]`); "Speichern & weiter" saves each connection's selection then advances.

- [ ] **Step 1: Add a failing test** for the second connection. In `CalendarSelectStep.test.tsx`, `useCalendarsForMember` is a single mock returning one calendar list. Because the component now renders one block per connection, the test provides two connections and asserts both members' calendars are requested. Add:

```tsx
  it('renders a calendar block for every connection', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [
        { connectionId: 'c1', memberId: 'm1', email: 'a@x', name: 'Anna', status: 'active', scopes: [] },
        { connectionId: 'c2', memberId: 'm2', email: 'b@x', name: 'Ben', status: 'active', scopes: [] },
      ],
      isLoading: false, isError: false,
    } as never)
    vi.mocked(useCalendarsForMember).mockImplementation((memberId: string) => ({
      calendars: [{ id: `cal-${memberId}`, summary: `Kalender ${memberId}`, backgroundColor: null, isPrimary: true, isSelected: true, color: 'hsl(1 1% 1%)', isShared: false, isWriteTarget: true }],
      isLoading: false, isError: false,
    }) as never)
    vi.mocked(useSaveSelectedCalendarsMutation).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)

    renderWithProviders(<CalendarSelectStep onNext={vi.fn()} />)
    expect(screen.getByText('Kalender m1')).toBeInTheDocument()
    expect(screen.getByText('Kalender m2')).toBeInTheDocument()
  })
```

> The existing single-connection tests keep working because `useCalendarsForMember` is still called once per connection; leave them as-is (they mock a single connection).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/setup/CalendarSelectStep.test.tsx`
Expected: FAIL — only the first connection's calendars render.

- [ ] **Step 3: Refactor `CalendarSelectStep.tsx`** to a parent that maps connections onto a per-connection child (a component so the hook is called once per connection):

```tsx
import { useState, useEffect } from 'react'
import type { ConnectionResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useCalendarsForMember, useSaveSelectedCalendarsMutation } from '@/features/google/useCalendars'

function ConnectionCalendarSelect({
  connection,
  onSelectionChange,
}: {
  connection: ConnectionResponse
  onSelectionChange: (memberId: string, calendarIds: string[]) => void
}) {
  const { calendars } = useCalendarsForMember(connection.memberId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && calendars.length > 0) {
      const next = new Set(calendars.filter((c) => c.isPrimary || c.isSelected).map((c) => c.id))
      setSelected(next)
      setInitialized(true)
      onSelectionChange(connection.memberId, Array.from(next))
    }
  }, [calendars, initialized, connection.memberId, onSelectionChange])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange(connection.memberId, Array.from(next))
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{connection.name}</h2>
      <ul className="flex flex-col gap-3">
        {calendars.map((cal) => (
          <li key={cal.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`cal-${cal.id}`}
              checked={selected.has(cal.id)}
              onChange={() => toggle(cal.id)}
              className="w-5 h-5 accent-blue-500 cursor-pointer"
            />
            <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: cal.color }} aria-hidden="true" />
            <label htmlFor={`cal-${cal.id}`} className="cursor-pointer">
              {cal.summary}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CalendarSelectStep({ onNext }: { onNext: () => void }) {
  const { connections, isLoading: connectionsLoading } = useGoogleConnections()
  const saveMutation = useSaveSelectedCalendarsMutation()
  const [byMember, setByMember] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)

  function handleSelectionChange(memberId: string, calendarIds: string[]) {
    setByMember((prev) => ({ ...prev, [memberId]: calendarIds }))
    setError(null)
  }

  const totalSelected = Object.values(byMember).reduce((n, ids) => n + ids.length, 0)

  async function handleSave() {
    setError(null)
    try {
      for (const [memberId, calendarIds] of Object.entries(byMember)) {
        await saveMutation.mutateAsync({ data: { memberId, calendarIds } })
      }
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kalender konnten nicht gespeichert werden.')
    }
  }

  if (connectionsLoading) {
    return <p className="text-slate-300 text-center">Lade...</p>
  }

  if (connections.length === 0) {
    return <p className="text-slate-300 text-center">Keine Verbindung gefunden.</p>
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <h1 className="text-2xl font-bold text-center">Kalender auswählen</h1>
      <p className="text-slate-300">Wähle die Kalender aus, die du synchronisieren möchtest.</p>

      {connections.map((connection) => (
        <ConnectionCalendarSelect
          key={connection.connectionId}
          connection={connection}
          onSelectionChange={handleSelectionChange}
        />
      ))}

      {totalSelected === 0 && (
        <p className="text-red-400 text-sm text-center">Wähle mindestens einen Kalender aus.</p>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="button"
        disabled={totalSelected === 0}
        onClick={handleSave}
        className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
      >
        Speichern &amp; weiter
      </button>
    </div>
  )
}
```

> The single-connection tests still pass: with one connection, `totalSelected` mirrors that block's selection, the pre-selection effect seeds `byMember`, and `handleSave` calls `mutateAsync` once with `{ memberId, calendarIds }`. The "no calendars selected disables the button" test still holds because deselecting the only calendar drops `totalSelected` to 0.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/setup/CalendarSelectStep.test.tsx`
Expected: PASS (new multi-connection test + existing ones). If a legacy assertion relied on `calendarIds: expect.arrayContaining(['cal-1','cal-3'])`, it still holds for the single-connection fixture.

- [ ] **Step 5: Run the frontend gate**

Run: `cd frontend && npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/setup/CalendarSelectStep.tsx \
        frontend/src/features/setup/CalendarSelectStep.test.tsx
git commit -m "feat(setup): select calendars for every connected account"
```

---

## Task 16: E2E — two accounts, shared calendar, three distinct colors

**Files:**
- Modify: `frontend/e2e/calendar.spec.ts`

**Interfaces:**
- Consumes: `GET /api/v1/google/calendars/all` (aggregate colors), `GET /api/v1/events` (events carry `calendarId`), the running app.

- [ ] **Step 1: Add the failing E2E test.** Append to `frontend/e2e/calendar.spec.ts`:

```ts
test('events are colored per calendar across two accounts, shared calendar stands out', async ({ page }) => {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )
  await page.route('**/api/v1/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'm1', name: 'Anna', role: 'parent', color: 'green', isActive: true, createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Ben', role: 'parent', color: 'blue', isActive: true, createdAt: '', updatedAt: '' },
      ]),
    }),
  )
  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Aggregate calendar colors: Anna's personal (green), Ben's personal (blue), a shared one (amber)
  await page.route('**/api/v1/google/calendars/all', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'cal-anna', summary: 'Anna', isPrimary: true, isSelected: true, color: 'hsl(140 60% 65%)', isShared: false, isWriteTarget: true, ownerMemberId: 'm1' },
        { id: 'cal-ben', summary: 'Ben', isPrimary: true, isSelected: true, color: 'hsl(210 80% 70%)', isShared: false, isWriteTarget: true, ownerMemberId: 'm2' },
        { id: 'cal-shared', summary: 'Feiertage', isPrimary: false, isSelected: true, color: 'hsl(45 90% 55%)', isShared: true, isWriteTarget: false, ownerMemberId: 'm1' },
      ]),
    }),
  )

  const day = '2026-07-21'
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', title: 'Anna Termin', memberId: 'm1', calendarId: 'cal-anna', isAllDay: false, start: `${day}T09:00:00Z`, end: `${day}T10:00:00Z` },
        { id: '2', title: 'Ben Termin', memberId: 'm2', calendarId: 'cal-ben', isAllDay: false, start: `${day}T11:00:00Z`, end: `${day}T12:00:00Z` },
        { id: '3', title: 'Feiertag', memberId: 'm1', calendarId: 'cal-shared', isAllDay: false, start: `${day}T13:00:00Z`, end: `${day}T14:00:00Z` },
      ]),
    })
  })

  await page.goto('/')

  const anna = page.getByRole('button', { name: /Anna Termin/ })
  const ben = page.getByRole('button', { name: /Ben Termin/ })
  const shared = page.getByRole('button', { name: /Feiertag/ })

  await expect(anna).toBeVisible()
  await expect(ben).toBeVisible()
  await expect(shared).toBeVisible()

  const colorOf = (loc: typeof anna) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  const [cAnna, cBen, cShared] = await Promise.all([colorOf(anna), colorOf(ben), colorOf(shared)])

  // three distinct colors; the shared one differs from both personal colors
  expect(new Set([cAnna, cBen, cShared]).size).toBe(3)
})
```

- [ ] **Step 2: Run it to verify it passes end-to-end**

Run: `cd frontend && npm run test:e2e`
Expected: PASS — the week view paints three distinct background colors. If the events render on a day outside the default visible week, adjust `day` to a date inside the current week the app opens on (the existing spec uses the app's default anchor; align the fixture dates the same way).

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/calendar.spec.ts
git commit -m "test(calendar): e2e multi-account per-calendar coloring"
```

---

## Task 17: Full gate + docs status

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-multi-account-calendar-color-design.md` (status line only)

- [ ] **Step 1: Run the complete pre-commit gate**

Run: `scripts/pre-commit-check.sh`
Expected: backend `./gradlew check` and frontend `npm run check` both PASS. Then `cd frontend && npm run test:e2e` PASS.

- [ ] **Step 2: Mark the design implemented.** In the spec header, change `**Status:** Genehmigt (Design), bereit für Implementierungsplan` to `**Status:** Umgesetzt (siehe docs/superpowers/plans/2026-08-03-multi-account-calendar-colors.md)`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-multi-account-calendar-color-design.md
git commit -m "docs(calendar): mark multi-account color design as implemented"
```

---

## Self-Review

**Spec coverage** (against `…-design.md`):

| Spec item | Task |
|---|---|
| Ursache #1 — Setup nur erstes Konto | Task 15 |
| Ursache #2 — Scheduler entdeckt keine Kalender | Task 5 |
| Ursache #3 — geteilte Kalender / Farbe nicht am Owner | Task 4 + 13 (Farbe an `calendarId`, nicht `ownerMemberId`) |
| Ursache #4 — OAuth erzwingt keine Kontoauswahl | Task 7 |
| Ursache #5 — Farbe pro Mitglied statt Kalender | Task 4, 9, 13 |
| Datenmodell V10 (`is_shared`, `is_write_target`, Teil-Unique) | Task 1, 2 |
| `resolveCalendarColor` (shared-Palette deterministisch; persönlich = Kontofarbe) | Task 3, 4 |
| API: aggregierte Liste + Farbe + Flags-Endpoint | Task 8, 10 |
| Schreibziel beim Anlegen (`is_write_target`) | Task 6 |
| Frontend: Coloring by calendar | Task 13 |
| Frontend: Flags in „Kalender verwalten" (geteilt/primär/Farbvorschau) | Task 14 |
| Tests Backend/Frontend/E2E | Tasks 1–16 (TDD throughout) |

**Deliberate deviations from the design text** (both justified above under "Rekonziliation"): the scheduler fix lands in `syncConnection` (not the scheduler), and the shared palette lives **only** in the backend (the frontend consumes the backend-resolved `color`), so `colors.ts` gains **no** shared palette — one fewer duplication point than the design's file list implied.

**Placeholder scan:** no `TBD`/`add error handling`/`similar to Task N`; every code step shows complete code; every run step shows an exact command + expected result.

**Type consistency:** `CalendarView` gains `color/isShared/isWriteTarget/ownerMemberId` in Task 9 and is consumed with those exact names in Task 10; `CalendarColorResolver.colorFor` (Task 4) is used verbatim in Task 9; `CalendarGridProps.calendarColors` (Task 13) is consumed identically in WeekGrid/DayGrid/AgendaList/CalendarView; `updateCalendarFlags`/`useUpdateCalendarFlagsMutation`/`CalendarFlagsRequest` names match across Tasks 8, 10, 12, 14.

**Open points from the design, now decided:**
- *Flag-Update API-Form:* one combined endpoint `PUT /v1/google/calendars/flags` with `{ memberId, calendarId, isShared?, isWriteTarget? }` (memberId scopes the connection).
- *Shared-Palette Sortierschlüssel/Umfang:* 6 Farben, global stabil nach `google_calendar_id` sortiert, `index % 6` bei Kollision (Task 3/4).
- *Scheduler-Reihenfolge/Idempotenz:* `refreshCalendars` upsertet je Verbindung und flippt nie `isSelected`; pro aktivem Konto einmal, isoliert im bestehenden try/catch des Schedulers.
