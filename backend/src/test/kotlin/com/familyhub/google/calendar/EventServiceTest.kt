package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import com.google.api.services.calendar.model.Event as GoogleEvent
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class EventServiceTest {

    // ─── Mocks ────────────────────────────────────────────────────────────────

    private val eventRepository = mockk<EventRepository>()
    private val subscriptionRepository = mockk<CalendarSubscriptionRepository>()
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val calendarClient = mockk<GoogleCalendarClient>()
    private val mapper = EventMapper()

    private lateinit var service: EventService

    // ─── Fixed test data ──────────────────────────────────────────────────────

    private val memberId = UUID.randomUUID()
    private val connectionId = UUID.randomUUID()
    private val subscriptionId = UUID.randomUUID()
    private val eventId = UUID.randomUUID()

    private val connection = GoogleConnection(
        familyMemberId = memberId,
        credentialsId = null,
        googleAccountId = "g123",
        email = "test@example.com",
        accessToken = "enc_token",
        refreshToken = "enc_refresh",
        tokenExpiresAt = null,
        status = "active",
    ).also { it.id = connectionId }

    private val primarySubscription = CalendarSubscription(
        connectionId = connectionId,
        googleCalendarId = "primary@gmail.com",
        summary = "Primary",
        isPrimary = true,
        isSelected = true,
    ).also { it.id = subscriptionId }

    private val secondarySubscription = CalendarSubscription(
        connectionId = connectionId,
        googleCalendarId = "secondary@gmail.com",
        summary = "Secondary",
        isPrimary = false,
        isSelected = true,
    ).also { it.id = UUID.randomUUID() }

    private val startTime = Instant.parse("2026-08-01T10:00:00Z")
    private val endTime = Instant.parse("2026-08-01T11:00:00Z")

    private val timedEvent = Event(
        subscriptionId = subscriptionId,
        googleEventId = "google-evt-1",
        googleCalendarId = "primary@gmail.com",
        ownerMemberId = memberId,
        title = "Meeting",
        description = "Team standup",
        location = "Office",
        startTime = startTime,
        endTime = endTime,
        isAllDay = false,
        syncStatus = "synced",
    ).also { it.id = eventId }

    private val allDayEvent = Event(
        subscriptionId = subscriptionId,
        googleEventId = "google-evt-2",
        googleCalendarId = "primary@gmail.com",
        ownerMemberId = memberId,
        title = "Holiday",
        isAllDay = true,
        allDayStart = LocalDate.of(2026, 8, 1),
        allDayEnd = LocalDate.of(2026, 8, 1),
        syncStatus = "synced",
    ).also { it.id = UUID.randomUUID() }

    @BeforeEach
    fun setUp() {
        service = EventService(
            eventRepository = eventRepository,
            subscriptionRepository = subscriptionRepository,
            connectionRepository = connectionRepository,
            calendarClient = calendarClient,
            mapper = mapper,
        )
    }

    // ─── list ─────────────────────────────────────────────────────────────────

    @Test
    fun `list with start and end calls findByStartTimeBetween`() {
        every { eventRepository.findByStartTimeBetween(startTime, endTime) } returns listOf(timedEvent)

        val result = service.list(start = startTime, end = endTime, memberId = null, calendarId = null)

        assertThat(result).hasSize(1)
        assertThat(result[0].title).isEqualTo("Meeting")
        verify(exactly = 1) { eventRepository.findByStartTimeBetween(startTime, endTime) }
        verify(exactly = 0) { eventRepository.findAll() }
    }

    @Test
    fun `list without start or end calls findAll`() {
        every { eventRepository.findAll() } returns listOf(timedEvent, allDayEvent)

        val result = service.list(start = null, end = null, memberId = null, calendarId = null)

        assertThat(result).hasSize(2)
        verify(exactly = 1) { eventRepository.findAll() }
        verify(exactly = 0) { eventRepository.findByStartTimeBetween(any(), any()) }
    }

    @Test
    fun `list filters by memberId when provided`() {
        val otherMemberId = UUID.randomUUID()
        val otherEvent = Event(
            subscriptionId = subscriptionId,
            googleEventId = "google-evt-other",
            googleCalendarId = "primary@gmail.com",
            ownerMemberId = otherMemberId,
            title = "Other Member Event",
            isAllDay = false,
            syncStatus = "synced",
        ).also { it.id = UUID.randomUUID() }
        every { eventRepository.findAll() } returns listOf(timedEvent, otherEvent)

        val result = service.list(start = null, end = null, memberId = memberId, calendarId = null)

        assertThat(result).hasSize(1)
        assertThat(result[0].memberId).isEqualTo(memberId)
    }

    @Test
    fun `list with null memberId does not filter by member`() {
        val otherMemberId = UUID.randomUUID()
        val otherEvent = Event(
            subscriptionId = subscriptionId,
            googleEventId = "google-evt-other",
            googleCalendarId = "primary@gmail.com",
            ownerMemberId = otherMemberId,
            title = "Other Member Event",
            isAllDay = false,
            syncStatus = "synced",
        ).also { it.id = UUID.randomUUID() }
        every { eventRepository.findAll() } returns listOf(timedEvent, otherEvent)

        val result = service.list(start = null, end = null, memberId = null, calendarId = null)

        assertThat(result).hasSize(2)
    }

    @Test
    fun `list filters by calendarId when provided`() {
        every { eventRepository.findAll() } returns listOf(timedEvent, allDayEvent)

        val result = service.list(start = null, end = null, memberId = null, calendarId = "primary@gmail.com")

        assertThat(result).hasSize(2) // both are on primary
    }

    @Test
    fun `list with null calendarId does not filter by calendar`() {
        every { eventRepository.findAll() } returns listOf(timedEvent, allDayEvent)

        val result = service.list(start = null, end = null, memberId = null, calendarId = null)

        assertThat(result).hasSize(2)
    }

    @Test
    fun `list filters by calendarId and excludes non-matching events`() {
        val eventOnOtherCal = Event(
            subscriptionId = UUID.randomUUID(),
            googleEventId = "google-evt-3",
            googleCalendarId = "other@gmail.com",
            ownerMemberId = memberId,
            title = "Other Calendar Event",
            isAllDay = false,
            syncStatus = "synced",
        ).also { it.id = UUID.randomUUID() }
        every { eventRepository.findAll() } returns listOf(timedEvent, eventOnOtherCal)

        val result = service.list(start = null, end = null, memberId = null, calendarId = "primary@gmail.com")

        assertThat(result).hasSize(1)
        assertThat(result[0].calendarId).isEqualTo("primary@gmail.com")
    }

    // ─── get ──────────────────────────────────────────────────────────────────

    @Test
    fun `get returns EventView when found`() {
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)

        val result = service.get(eventId)

        assertThat(result.id).isEqualTo(eventId)
        assertThat(result.title).isEqualTo("Meeting")
        assertThat(result.description).isEqualTo("Team standup")
        assertThat(result.location).isEqualTo("Office")
        assertThat(result.start).isEqualTo(startTime)
        assertThat(result.end).isEqualTo(endTime)
        assertThat(result.isAllDay).isFalse()
        assertThat(result.memberId).isEqualTo(memberId)
        assertThat(result.calendarId).isEqualTo("primary@gmail.com")
    }

    @Test
    fun `get throws ResourceNotFoundException when not found`() {
        every { eventRepository.findById(eventId) } returns Optional.empty()

        assertThatThrownBy { service.get(eventId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Termin nicht gefunden")
    }

    // ─── create ───────────────────────────────────────────────────────────────

    @Test
    fun `create throws ResourceNotFoundException when no connection for member`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Meeting",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.create(cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Keine Google-Verbindung für dieses Mitglied gefunden")
    }

    @Test
    fun `create with calendarId provided and found inserts event`() {
        val googleInserted = GoogleEvent()
            .setId("google-evt-new")
            .setSummary("Meeting")
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com") } returns primarySubscription
        every { calendarClient.insertEvent(connection, "primary@gmail.com", any()) } returns googleInserted
        every { eventRepository.save(any<Event>()) } answers { firstArg<Event>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = "primary@gmail.com",
            title = "Meeting",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        val result = service.create(cmd)

        assertThat(result.title).isEqualTo("Meeting")
        assertThat(result.calendarId).isEqualTo("primary@gmail.com")
        verify(exactly = 1) { calendarClient.insertEvent(connection, "primary@gmail.com", any()) }
        verify(exactly = 1) { eventRepository.save(any<Event>()) }
    }

    @Test
    fun `create with calendarId provided but not found throws ValidationException`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "unknown@gmail.com") } returns null

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = "unknown@gmail.com",
            title = "Meeting",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.create(cmd) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Kalender nicht gefunden")
    }

    @Test
    fun `create with null calendarId uses primary subscription`() {
        val googleInserted = GoogleEvent()
            .setId("google-evt-new")
            .setSummary("Meeting")
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findAllByConnectionId(connectionId) } returns listOf(primarySubscription, secondarySubscription)
        every { calendarClient.insertEvent(connection, "primary@gmail.com", any()) } returns googleInserted
        every { eventRepository.save(any<Event>()) } answers { firstArg<Event>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Meeting",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        val result = service.create(cmd)

        assertThat(result.calendarId).isEqualTo("primary@gmail.com")
        verify(exactly = 1) { calendarClient.insertEvent(connection, "primary@gmail.com", any()) }
    }

    @Test
    fun `create with null calendarId and no primary throws ValidationException`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findAllByConnectionId(connectionId) } returns listOf(secondarySubscription)

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Meeting",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.create(cmd) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Kein Zielkalender vorhanden")
    }

    // ─── update ───────────────────────────────────────────────────────────────

    @Test
    fun `update throws ResourceNotFoundException when event not found`() {
        every { eventRepository.findById(eventId) } returns Optional.empty()

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Updated",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.update(eventId, cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Termin nicht gefunden")
    }

    @Test
    fun `update throws ResourceNotFoundException when no connection for owner`() {
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Updated",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.update(eventId, cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `update throws ResourceNotFoundException when subscription not found`() {
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com") } returns null

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Updated",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        assertThatThrownBy { service.update(eventId, cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `update happy path preserves local event id and updates in Google`() {
        val googleUpdated = GoogleEvent()
            .setId("google-evt-1")
            .setSummary("Updated Title")
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com") } returns primarySubscription
        every { calendarClient.updateEvent(connection, "primary@gmail.com", any()) } returns googleUpdated
        every { eventRepository.save(any<Event>()) } answers { firstArg() }

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Updated Title",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        val result = service.update(eventId, cmd)

        assertThat(result.id).isEqualTo(eventId)
        assertThat(result.title).isEqualTo("Updated Title")
        verify(exactly = 1) { calendarClient.updateEvent(connection, "primary@gmail.com", any()) }
        verify(exactly = 1) { eventRepository.save(any<Event>()) }
    }

    @Test
    fun `update saved entity has local id preserved`() {
        val googleUpdated = GoogleEvent()
            .setId("google-evt-1")
            .setSummary("Updated Title")
        val savedSlot = mutableListOf<Event>()
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com") } returns primarySubscription
        every { calendarClient.updateEvent(connection, "primary@gmail.com", any()) } returns googleUpdated
        every { eventRepository.save(capture(savedSlot)) } answers { firstArg() }

        val cmd = CreateEventCommand(
            memberId = memberId,
            calendarId = null,
            title = "Updated Title",
            start = startTime,
            end = endTime,
            isAllDay = false,
        )

        service.update(eventId, cmd)

        assertThat(savedSlot).hasSize(1)
        assertThat(savedSlot[0].id).isEqualTo(eventId)
    }

    // ─── delete ───────────────────────────────────────────────────────────────

    @Test
    fun `delete throws ResourceNotFoundException when event not found`() {
        every { eventRepository.findById(eventId) } returns Optional.empty()

        assertThatThrownBy { service.delete(eventId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Termin nicht gefunden")
    }

    @Test
    fun `delete throws ResourceNotFoundException when no connection for owner`() {
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        assertThatThrownBy { service.delete(eventId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `delete happy path calls Google delete before local delete`() {
        every { eventRepository.findById(eventId) } returns Optional.of(timedEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { calendarClient.deleteEvent(connection, "primary@gmail.com", "google-evt-1") } returns Unit
        every { eventRepository.delete(timedEvent) } returns Unit

        service.delete(eventId)

        verifyOrder {
            calendarClient.deleteEvent(connection, "primary@gmail.com", "google-evt-1")
            eventRepository.delete(timedEvent)
        }
    }
}
