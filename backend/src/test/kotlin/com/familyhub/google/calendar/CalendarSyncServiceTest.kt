package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.google.api.client.util.DateTime
import com.google.api.services.calendar.model.Event as GoogleEvent
import com.google.api.services.calendar.model.EventDateTime
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class CalendarSyncServiceTest {

    private val calendarClient = mockk<GoogleCalendarClient>()
    private val subscriptionRepo = mockk<CalendarSubscriptionRepository>()
    private val eventRepo = mockk<EventRepository>()
    private val connectionRepo = mockk<GoogleConnectionRepository>()
    private val fixedNow = Instant.parse("2026-07-23T12:00:00Z")
    private val clock = Clock.fixed(fixedNow, ZoneOffset.UTC)

    private lateinit var service: CalendarSyncService

    private val connectionId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    private val activeConnection = GoogleConnection(
        familyMemberId = memberId,
        credentialsId = null,
        googleAccountId = "g123",
        email = "test@example.com",
        accessToken = "enc_token",
        refreshToken = "enc_refresh",
        tokenExpiresAt = null,
        status = "active",
        lastSyncedAt = null,
    ).also { it.id = connectionId }

    private val inactiveConnection = GoogleConnection(
        familyMemberId = memberId,
        credentialsId = null,
        googleAccountId = "g456",
        email = "inactive@example.com",
        accessToken = "enc_token",
        refreshToken = "enc_refresh",
        tokenExpiresAt = null,
        status = "revoked",
        lastSyncedAt = null,
    ).also { it.id = UUID.randomUUID() }

    @BeforeEach
    fun setUp() {
        service = CalendarSyncService(
            calendarClient = calendarClient,
            subscriptionRepo = subscriptionRepo,
            eventRepo = eventRepo,
            connectionRepo = connectionRepo,
            clock = clock,
        )
    }

    // ─── refreshCalendars: new subscription ───────────────────────────────────

    @Test
    fun `refreshCalendars creates new subscription when not found`() {
        val calendarInfo = GoogleCalendarInfo(
            id = "cal1@gmail.com",
            summary = "Family",
            backgroundColor = "#ff0000",
            primary = true,
        )
        every { calendarClient.listCalendars(activeConnection) } returns listOf(calendarInfo)
        every { subscriptionRepo.findByConnectionIdAndGoogleCalendarId(connectionId, "cal1@gmail.com") } returns null
        val savedSlot = slot<CalendarSubscription>()
        every { subscriptionRepo.save(capture(savedSlot)) } answers { firstArg() }

        service.refreshCalendars(activeConnection)

        verify(exactly = 1) { subscriptionRepo.save(any()) }
        val saved = savedSlot.captured
        assertThat(saved.connectionId).isEqualTo(connectionId)
        assertThat(saved.googleCalendarId).isEqualTo("cal1@gmail.com")
        assertThat(saved.summary).isEqualTo("Family")
        assertThat(saved.backgroundColor).isEqualTo("#ff0000")
        assertThat(saved.isPrimary).isTrue()
        assertThat(saved.isSelected).isFalse()
    }

    // ─── refreshCalendars: existing subscription updated ──────────────────────

    @Test
    fun `refreshCalendars updates existing subscription summary and color`() {
        val calendarInfo = GoogleCalendarInfo(
            id = "cal1@gmail.com",
            summary = "Family Updated",
            backgroundColor = "#00ff00",
            primary = false,
        )
        val existingSub = CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "cal1@gmail.com",
            summary = "Family Old",
            backgroundColor = "#ff0000",
            isPrimary = true,
            isSelected = true,
        ).also { it.id = UUID.randomUUID() }

        every { calendarClient.listCalendars(activeConnection) } returns listOf(calendarInfo)
        every { subscriptionRepo.findByConnectionIdAndGoogleCalendarId(connectionId, "cal1@gmail.com") } returns existingSub
        every { subscriptionRepo.save(any<CalendarSubscription>()) } answers { firstArg() }

        service.refreshCalendars(activeConnection)

        verify(exactly = 1) { subscriptionRepo.save(any()) }
        assertThat(existingSub.summary).isEqualTo("Family Updated")
        assertThat(existingSub.backgroundColor).isEqualTo("#00ff00")
        assertThat(existingSub.isPrimary).isFalse()
        // isSelected must NOT be changed
        assertThat(existingSub.isSelected).isTrue()
    }

    // ─── syncConnection: inactive connection skipped ──────────────────────────

    @Test
    fun `syncConnection returns zero result when connection status is not active`() {
        val result = service.syncConnection(inactiveConnection)
        assertThat(result.created).isEqualTo(0)
        assertThat(result.updated).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(0)
        verify(exactly = 0) { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(any()) }
    }

    // ─── syncConnection: active connection, empty selection ───────────────────

    @Test
    fun `syncConnection returns zero result when no subscriptions are selected`() {
        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns emptyList()
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.syncConnection(activeConnection)
        assertThat(result.created).isEqualTo(0)
        assertThat(result.updated).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(0)
        verify(exactly = 0) { calendarClient.listEvents(any(), any(), any(), any(), any()) }
    }

    // ─── syncConnection: incremental sync — 1 new + 1 cancelled ─────────────

    @Test
    fun `syncConnection incremental sync creates new event and deletes cancelled`() {
        val subId = UUID.randomUUID()
        val subscription = CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "cal1@gmail.com",
            summary = "Family",
            isSelected = true,
            syncToken = "existing-sync-token",
        ).also { it.id = subId }

        val startMillis = Instant.parse("2026-08-01T10:00:00Z").toEpochMilli()
        val endMillis = Instant.parse("2026-08-01T11:00:00Z").toEpochMilli()

        val newEvent = GoogleEvent()
            .setId("evt-new")
            .setSummary("New Meeting")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(startMillis)))
            .setEnd(EventDateTime().setDateTime(DateTime(endMillis)))

        val cancelledEvent = GoogleEvent()
            .setId("evt-cancelled")
            .setSummary("Old Event")
            .setStatus("cancelled")

        val eventPage = EventPage(
            events = listOf(newEvent, cancelledEvent),
            nextSyncToken = "new-sync-token",
            fullResyncRequired = false,
        )

        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(subscription)
        every { calendarClient.listEvents(activeConnection, "cal1@gmail.com", "existing-sync-token", null, null) } returns eventPage
        every { eventRepo.findByGoogleEventIdAndGoogleCalendarId("evt-new", "cal1@gmail.com") } returns null
        every { eventRepo.findByGoogleEventIdAndGoogleCalendarId("evt-cancelled", "cal1@gmail.com") } returns null
        every { eventRepo.save(any<Event>()) } answers { firstArg() }
        every { eventRepo.deleteByGoogleEventIdAndGoogleCalendarId("evt-cancelled", "cal1@gmail.com") } returns Unit
        every { subscriptionRepo.save(any<CalendarSubscription>()) } answers { firstArg() }
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.syncConnection(activeConnection)

        assertThat(result.created).isEqualTo(1)
        assertThat(result.updated).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(1)

        // Sync token saved
        assertThat(subscription.syncToken).isEqualTo("new-sync-token")
        verify(exactly = 1) { subscriptionRepo.save(subscription) }

        // lastSyncedAt set on connection
        assertThat(activeConnection.lastSyncedAt).isEqualTo(fixedNow)
        verify(exactly = 1) { connectionRepo.save(activeConnection) }
    }

    // ─── syncConnection: existing event → update ──────────────────────────────

    @Test
    fun `syncConnection updates existing event when found`() {
        val subId = UUID.randomUUID()
        val subscription = CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "cal1@gmail.com",
            summary = "Family",
            isSelected = true,
            syncToken = "sync-token",
        ).also { it.id = subId }

        val startMillis = Instant.parse("2026-08-01T10:00:00Z").toEpochMilli()
        val endMillis = Instant.parse("2026-08-01T11:00:00Z").toEpochMilli()

        val updatedGoogleEvent = GoogleEvent()
            .setId("evt-existing")
            .setSummary("Updated Title")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(startMillis)))
            .setEnd(EventDateTime().setDateTime(DateTime(endMillis)))

        val existingEntity = Event(
            subscriptionId = subId,
            googleEventId = "evt-existing",
            googleCalendarId = "cal1@gmail.com",
            ownerMemberId = memberId,
            title = "Old Title",
            isAllDay = false,
            syncStatus = "synced",
        ).also { it.id = UUID.randomUUID() }

        val eventPage = EventPage(
            events = listOf(updatedGoogleEvent),
            nextSyncToken = "new-sync-token",
            fullResyncRequired = false,
        )

        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(subscription)
        every { calendarClient.listEvents(activeConnection, "cal1@gmail.com", "sync-token", null, null) } returns eventPage
        every { eventRepo.findByGoogleEventIdAndGoogleCalendarId("evt-existing", "cal1@gmail.com") } returns existingEntity
        every { eventRepo.save(any<Event>()) } answers { firstArg() }
        every { subscriptionRepo.save(any<CalendarSubscription>()) } answers { firstArg() }
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.syncConnection(activeConnection)

        assertThat(result.created).isEqualTo(0)
        assertThat(result.updated).isEqualTo(1)
        assertThat(result.deleted).isEqualTo(0)
        assertThat(existingEntity.title).isEqualTo("Updated Title")
    }

    // ─── syncConnection: fullResyncRequired=true → full resync ───────────────

    @Test
    fun `syncConnection performs full resync when fullResyncRequired on first call`() {
        val subId = UUID.randomUUID()
        val subscription = CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "cal1@gmail.com",
            summary = "Family",
            isSelected = true,
            syncToken = "stale-token",
        ).also { it.id = subId }

        val startMillis = Instant.parse("2026-08-15T09:00:00Z").toEpochMilli()
        val endMillis = Instant.parse("2026-08-15T10:00:00Z").toEpochMilli()

        val freshEvent = GoogleEvent()
            .setId("evt-fresh")
            .setSummary("Fresh Event")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(startMillis)))
            .setEnd(EventDateTime().setDateTime(DateTime(endMillis)))

        // First call with stale token → fullResyncRequired
        val fullResyncPage = EventPage(
            events = emptyList(),
            nextSyncToken = null,
            fullResyncRequired = true,
        )
        // Second call with timeMin/timeMax → returns fresh events
        val fullSyncResult = EventPage(
            events = listOf(freshEvent),
            nextSyncToken = "fresh-sync-token",
            fullResyncRequired = false,
        )

        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(subscription)
        // First call with stale token
        every {
            calendarClient.listEvents(activeConnection, "cal1@gmail.com", "stale-token", null, null)
        } returns fullResyncPage
        // Second call with time window (null syncToken, timeMin/timeMax set)
        every {
            calendarClient.listEvents(activeConnection, "cal1@gmail.com", null, any<DateTime>(), any<DateTime>())
        } returns fullSyncResult
        every { eventRepo.findByGoogleEventIdAndGoogleCalendarId("evt-fresh", "cal1@gmail.com") } returns null
        every { eventRepo.save(any<Event>()) } answers { firstArg() }
        every { subscriptionRepo.save(any<CalendarSubscription>()) } answers { firstArg() }
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        val result = service.syncConnection(activeConnection)

        assertThat(result.created).isEqualTo(1)
        assertThat(result.updated).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(0)
        assertThat(subscription.syncToken).isEqualTo("fresh-sync-token")
    }

    // ─── syncConnection: nextSyncToken null → syncToken cleared ─────────────

    @Test
    fun `syncConnection clears syncToken when nextSyncToken is null in response`() {
        val subId = UUID.randomUUID()
        val subscription = CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "cal1@gmail.com",
            summary = "Family",
            isSelected = true,
            syncToken = null,
        ).also { it.id = subId }

        val eventPage = EventPage(
            events = emptyList(),
            nextSyncToken = null,
            fullResyncRequired = false,
        )

        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(subscription)
        every {
            calendarClient.listEvents(activeConnection, "cal1@gmail.com", null, null, null)
        } returns eventPage
        every { subscriptionRepo.save(any<CalendarSubscription>()) } answers { firstArg() }
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        service.syncConnection(activeConnection)

        assertThat(subscription.syncToken).isNull()
        verify(exactly = 1) { subscriptionRepo.save(subscription) }
    }

    // ─── syncAll ─────────────────────────────────────────────────────────────

    @Test
    fun `syncAll calls syncConnection for all active connections`() {
        val conn1 = GoogleConnection(
            familyMemberId = UUID.randomUUID(),
            credentialsId = null,
            googleAccountId = "acc1",
            email = "a@example.com",
            accessToken = "t1",
            refreshToken = "r1",
            tokenExpiresAt = null,
            status = "active",
        ).also { it.id = UUID.randomUUID() }

        every { connectionRepo.findAllByStatus("active") } returns listOf(conn1)
        every { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(conn1.id!!) } returns emptyList()
        every { connectionRepo.save(any<GoogleConnection>()) } answers { firstArg() }

        service.syncAll()

        verify(exactly = 1) { subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(conn1.id!!) }
    }
}
