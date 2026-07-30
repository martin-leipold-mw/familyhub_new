package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Optional
import java.util.UUID
import com.google.api.services.calendar.model.Event as GoogleEvent

/**
 * Series-scoped update/delete and [EventService.getSeries] — split out of
 * [EventServiceTest] to keep both classes under the detekt LargeClass threshold.
 */
class EventServiceSeriesTest {
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

    private val connection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g123",
            email = "test@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            status = "active",
        ).also { it.id = connectionId }

    private val primarySubscription =
        CalendarSubscription(
            connectionId = connectionId,
            googleCalendarId = "primary@gmail.com",
            summary = "Primary",
            isPrimary = true,
            isSelected = true,
        ).also { it.id = subscriptionId }

    private val startTime = Instant.parse("2026-08-01T10:00:00Z")
    private val endTime = Instant.parse("2026-08-01T11:00:00Z")

    // A plain (non-recurring) local event: no recurrenceId, used for the negative
    // "not part of a series" branches.
    private val plainEvent =
        Event(
            subscriptionId = subscriptionId,
            googleEventId = "google-evt-1",
            googleCalendarId = "primary@gmail.com",
            ownerMemberId = memberId,
            title = "Meeting",
            startTime = startTime,
            endTime = endTime,
            isAllDay = false,
            syncStatus = "synced",
        ).also { it.id = eventId }

    // A local instance belonging to a recurring series: googleEventId is the instance id
    // ("master1_20260731"), recurrenceId is the parent/master event id ("master1").
    private val seriesInstanceEvent =
        Event(
            subscriptionId = subscriptionId,
            googleEventId = "master1_20260731",
            googleCalendarId = "primary@gmail.com",
            ownerMemberId = memberId,
            title = "Weekly Sync",
            startTime = startTime,
            endTime = endTime,
            isAllDay = false,
            recurrenceId = "master1",
            syncStatus = "synced",
        ).also { it.id = UUID.randomUUID() }

    @BeforeEach
    fun setUp() {
        service =
            EventService(
                eventRepository = eventRepository,
                subscriptionRepository = subscriptionRepository,
                connectionRepository = connectionRepository,
                calendarClient = calendarClient,
                mapper = mapper,
            )
    }

    // ─── delete: series scope ──────────────────────────────────────────────────

    @Test
    fun `delete with series scope targets the parent recurring event`() {
        val instanceId = seriesInstanceEvent.id!!
        every { eventRepository.findById(instanceId) } returns Optional.of(seriesInstanceEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { calendarClient.deleteEvent(connection, "primary@gmail.com", "master1") } returns Unit
        every { eventRepository.delete(seriesInstanceEvent) } returns Unit

        service.delete(instanceId, scope = "series")

        verify(exactly = 1) { calendarClient.deleteEvent(connection, "primary@gmail.com", "master1") }
        verify(exactly = 1) { eventRepository.delete(seriesInstanceEvent) }
    }

    @Test
    fun `delete with series scope but no recurrenceId throws ValidationException`() {
        every { eventRepository.findById(eventId) } returns Optional.of(plainEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection

        assertThatThrownBy { service.delete(eventId, scope = "series") }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Termin gehört zu keiner Serie")

        verify(exactly = 0) { calendarClient.deleteEvent(any(), any(), any()) }
    }

    // ─── update: series scope ─────────────────────────────────────────────────

    @Test
    fun `update with series scope targets the parent recurring event`() {
        val instanceId = seriesInstanceEvent.id!!
        val googleUpdated =
            GoogleEvent()
                .setId("master1")
                .setSummary("Updated Series Title")
        every { eventRepository.findById(instanceId) } returns Optional.of(seriesInstanceEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every {
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com")
        } returns primarySubscription
        every { calendarClient.updateEvent(connection, "primary@gmail.com", any()) } returns googleUpdated
        every { eventRepository.save(any<Event>()) } answers { firstArg<Event>().also { it.id = instanceId } }

        val cmd =
            CreateEventCommand(
                memberId = memberId,
                calendarId = null,
                title = "Updated Series Title",
                start = startTime,
                end = endTime,
                isAllDay = false,
            )

        val result = service.update(instanceId, cmd, scope = "series")

        assertThat(result.title).isEqualTo("Updated Series Title")
        verify(exactly = 1) {
            calendarClient.updateEvent(
                connection,
                "primary@gmail.com",
                match { it.id == "master1" },
            )
        }
    }

    @Test
    fun `update with series scope but no recurrenceId throws ValidationException`() {
        every { eventRepository.findById(eventId) } returns Optional.of(plainEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every {
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com")
        } returns primarySubscription

        val cmd =
            CreateEventCommand(
                memberId = memberId,
                calendarId = null,
                title = "Updated",
                start = startTime,
                end = endTime,
                isAllDay = false,
            )

        assertThatThrownBy { service.update(eventId, cmd, scope = "series") }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Termin gehört zu keiner Serie")

        verify(exactly = 0) { calendarClient.updateEvent(any(), any(), any()) }
    }

    // ─── getSeries ─────────────────────────────────────────────────────────────

    @Test
    fun `getSeries returns RRULE`() {
        val instanceId = seriesInstanceEvent.id!!
        val master =
            GoogleEvent()
                .setId("master1")
                .setSummary("Weekly Sync")
                .setRecurrence(listOf("RRULE:FREQ=WEEKLY"))
        every { eventRepository.findById(instanceId) } returns Optional.of(seriesInstanceEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every {
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com")
        } returns primarySubscription
        every { calendarClient.getEvent(connection, "primary@gmail.com", "master1") } returns master

        val result = service.getSeries(instanceId)

        assertThat(result.recurringEventId).isEqualTo("master1")
        assertThat(result.recurrenceRule).isEqualTo("RRULE:FREQ=WEEKLY")
    }

    @Test
    fun `getSeries returns null recurrenceRule when master has no recurrence`() {
        // Exercises the missed branch: master.recurrence == null → safe-call short-circuits to null
        val instanceId = seriesInstanceEvent.id!!
        val master =
            GoogleEvent()
                .setId("master1")
                .setSummary("Weekly Sync")
        every { eventRepository.findById(instanceId) } returns Optional.of(seriesInstanceEvent)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every {
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, "primary@gmail.com")
        } returns primarySubscription
        every { calendarClient.getEvent(connection, "primary@gmail.com", "master1") } returns master

        val result = service.getSeries(instanceId)

        assertThat(result.recurrenceRule).isNull()
    }

    @Test
    fun `getSeries throws ValidationException when event has no recurrenceId`() {
        every { eventRepository.findById(eventId) } returns Optional.of(plainEvent)

        assertThatThrownBy { service.getSeries(eventId) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Termin gehört zu keiner Serie")

        verify(exactly = 0) { calendarClient.getEvent(any(), any(), any()) }
    }

    @Test
    fun `getSeries throws ResourceNotFoundException when event not found`() {
        every { eventRepository.findById(eventId) } returns Optional.empty()

        assertThatThrownBy { service.getSeries(eventId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Termin nicht gefunden")
    }
}
