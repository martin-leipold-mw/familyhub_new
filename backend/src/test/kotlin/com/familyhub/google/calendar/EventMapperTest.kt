package com.familyhub.google.calendar

import com.google.api.client.util.DateTime
import com.google.api.services.calendar.model.Event as GoogleEvent
import com.google.api.services.calendar.model.EventDateTime
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class EventMapperTest {

    private lateinit var mapper: EventMapper

    private val subscriptionId = UUID.randomUUID()
    private val ownerMemberId = UUID.randomUUID()

    private val subscription = CalendarSubscription(
        connectionId = UUID.randomUUID(),
        googleCalendarId = "test@gmail.com",
        summary = "Test Calendar",
    ).also { it.id = subscriptionId }

    @BeforeEach
    fun setUp() {
        mapper = EventMapper()
    }

    // ─── isCancelled ──────────────────────────────────────────────────────────

    @Test
    fun `isCancelled returns true when status is cancelled`() {
        val google = GoogleEvent().setStatus("cancelled")
        assertThat(mapper.isCancelled(google)).isTrue()
    }

    @Test
    fun `isCancelled returns false when status is confirmed`() {
        val google = GoogleEvent().setStatus("confirmed")
        assertThat(mapper.isCancelled(google)).isFalse()
    }

    @Test
    fun `isCancelled returns false when status is null`() {
        val google = GoogleEvent() // status not set → null
        assertThat(mapper.isCancelled(google)).isFalse()
    }

    // ─── toEntity: timed event ────────────────────────────────────────────────

    @Test
    fun `toEntity maps timed event dateTime to UTC Instants`() {
        // 2026-03-15T10:00:00Z = 1742032800000 ms
        val startMillis = Instant.parse("2026-03-15T10:00:00Z").toEpochMilli()
        val endMillis   = Instant.parse("2026-03-15T11:00:00Z").toEpochMilli()

        val google = GoogleEvent()
            .setId("evt-001")
            .setSummary("Arzttermin")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(startMillis)))
            .setEnd(EventDateTime().setDateTime(DateTime(endMillis)))
            .setEtag("\"etag-abc\"")
            .setRecurringEventId("recurring-001")
            .setDescription("Beim Hausarzt")
            .setLocation("Musterstraße 1")
            .setUpdated(DateTime(startMillis))

        val entity = mapper.toEntity(google, subscription, ownerMemberId)

        assertThat(entity.isAllDay).isFalse()
        assertThat(entity.startTime).isEqualTo(Instant.ofEpochMilli(startMillis))
        assertThat(entity.endTime).isEqualTo(Instant.ofEpochMilli(endMillis))
        assertThat(entity.allDayStart).isNull()
        assertThat(entity.allDayEnd).isNull()
        assertThat(entity.title).isEqualTo("Arzttermin")
        assertThat(entity.description).isEqualTo("Beim Hausarzt")
        assertThat(entity.location).isEqualTo("Musterstraße 1")
        assertThat(entity.etag).isEqualTo("\"etag-abc\"")
        assertThat(entity.recurrenceId).isEqualTo("recurring-001")
        assertThat(entity.googleUpdated).isEqualTo(Instant.ofEpochMilli(startMillis))
        assertThat(entity.googleEventId).isEqualTo("evt-001")
        assertThat(entity.googleCalendarId).isEqualTo("test@gmail.com")
        assertThat(entity.subscriptionId).isEqualTo(subscriptionId)
        assertThat(entity.ownerMemberId).isEqualTo(ownerMemberId)
        assertThat(entity.syncStatus).isEqualTo("synced")
    }

    // ─── toEntity: all-day event ──────────────────────────────────────────────

    @Test
    fun `toEntity maps all-day event and subtracts 1 day from exclusive end`() {
        // Google sends start=2026-07-01 (inclusive) and end=2026-07-02 (exclusive)
        // We expect allDayStart=2026-07-01 and allDayEnd=2026-07-01 (end -1 day)
        val startDate = DateTime("2026-07-01") // date-only
        val endDate   = DateTime("2026-07-02") // date-only, exclusive per Google

        val google = GoogleEvent()
            .setId("evt-allday")
            .setSummary("Urlaub")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDate(startDate))
            .setEnd(EventDateTime().setDate(endDate))

        val entity = mapper.toEntity(google, subscription, ownerMemberId)

        assertThat(entity.isAllDay).isTrue()
        assertThat(entity.allDayStart).isEqualTo(LocalDate.of(2026, 7, 1))
        // end is exclusive in Google, so stored end = Google end minus 1 day
        assertThat(entity.allDayEnd).isEqualTo(LocalDate.of(2026, 7, 1))
        assertThat(entity.startTime).isNull()
        assertThat(entity.endTime).isNull()
    }

    @Test
    fun `toEntity maps multi-day all-day event with correct exclusive end minus 1`() {
        // Google: start=2026-08-01, end=2026-08-05 (exclusive) → stored end=2026-08-04
        val startDate = DateTime("2026-08-01")
        val endDate   = DateTime("2026-08-05")

        val google = GoogleEvent()
            .setId("evt-multiday")
            .setSummary("Familienurlaub")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDate(startDate))
            .setEnd(EventDateTime().setDate(endDate))

        val entity = mapper.toEntity(google, subscription, ownerMemberId)

        assertThat(entity.isAllDay).isTrue()
        assertThat(entity.allDayStart).isEqualTo(LocalDate.of(2026, 8, 1))
        assertThat(entity.allDayEnd).isEqualTo(LocalDate.of(2026, 8, 4))
    }

    // ─── toEntity: title fallback ─────────────────────────────────────────────

    @Test
    fun `toEntity uses summary when present`() {
        val millis = Instant.parse("2026-01-01T09:00:00Z").toEpochMilli()
        val google = GoogleEvent()
            .setId("evt-title")
            .setSummary("Geburtstagsparty")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(millis)))
            .setEnd(EventDateTime().setDateTime(DateTime(millis + 3600_000L)))

        val entity = mapper.toEntity(google, subscription, ownerMemberId)
        assertThat(entity.title).isEqualTo("Geburtstagsparty")
    }

    @Test
    fun `toEntity falls back to 'Ohne Titel' when summary is null`() {
        val millis = Instant.parse("2026-01-01T09:00:00Z").toEpochMilli()
        val google = GoogleEvent()
            .setId("evt-notitle")
            // no setSummary → null
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(millis)))
            .setEnd(EventDateTime().setDateTime(DateTime(millis + 3600_000L)))

        val entity = mapper.toEntity(google, subscription, ownerMemberId)
        assertThat(entity.title).isEqualTo("Ohne Titel")
    }

    // ─── toEntity: nullable fields absent ────────────────────────────────────

    @Test
    fun `toEntity sets null for optional fields when absent`() {
        val millis = Instant.parse("2026-02-10T14:00:00Z").toEpochMilli()
        val google = GoogleEvent()
            .setId("evt-minimal")
            .setSummary("Minimal")
            .setStatus("confirmed")
            .setStart(EventDateTime().setDateTime(DateTime(millis)))
            .setEnd(EventDateTime().setDateTime(DateTime(millis + 1800_000L)))
        // no description, location, etag, recurringEventId, updated

        val entity = mapper.toEntity(google, subscription, ownerMemberId)
        assertThat(entity.description).isNull()
        assertThat(entity.location).isNull()
        assertThat(entity.etag).isNull()
        assertThat(entity.recurrenceId).isNull()
        assertThat(entity.googleUpdated).isNull()
    }

    // ─── toEntity: null start/end (edge cases for branch coverage) ──────────

    @Test
    fun `toEntity handles null start and end gracefully`() {
        // google.start == null → isAllDay=false (safe-call null path), startTime=null, endTime=null
        val google = GoogleEvent()
            .setId("evt-nostart")
            .setSummary("Kein Termin")
            .setStatus("confirmed")
        // No setStart / setEnd → both null

        val entity = mapper.toEntity(google, subscription, ownerMemberId)
        assertThat(entity.isAllDay).isFalse()
        assertThat(entity.startTime).isNull()
        assertThat(entity.endTime).isNull()
        assertThat(entity.allDayStart).isNull()
        assertThat(entity.allDayEnd).isNull()
    }

    @Test
    fun `toEntity handles EventDateTime with null dateTime (timed path, no dateTime set)`() {
        // start.dateTime == null but start.date also null → isAllDay=false, startTime/endTime=null
        val google = GoogleEvent()
            .setId("evt-empty-dt")
            .setSummary("Leerer Zeitblock")
            .setStatus("confirmed")
            .setStart(EventDateTime()) // date=null, dateTime=null
            .setEnd(EventDateTime())   // date=null, dateTime=null

        val entity = mapper.toEntity(google, subscription, ownerMemberId)
        assertThat(entity.isAllDay).isFalse()
        assertThat(entity.startTime).isNull()
        assertThat(entity.endTime).isNull()
    }

    // ─── toGoogleEvent: timed path ────────────────────────────────────────────

    @Test
    fun `toGoogleEvent maps timed EventCommand to Google Event with dateTime`() {
        val start = Instant.parse("2026-09-10T09:30:00Z")
        val end   = Instant.parse("2026-09-10T10:30:00Z")

        val cmd = EventCommand(
            title = "Meeting",
            description = "Wöchentliches Teammeeting",
            location = "Konferenzraum A",
            start = start,
            end = end,
            allDayStart = null,
            allDayEnd = null,
            isAllDay = false,
        )

        val googleEvent = mapper.toGoogleEvent(cmd)

        assertThat(googleEvent.summary).isEqualTo("Meeting")
        assertThat(googleEvent.description).isEqualTo("Wöchentliches Teammeeting")
        assertThat(googleEvent.location).isEqualTo("Konferenzraum A")

        // start.dateTime must be set, start.date must be null
        assertThat(googleEvent.start.dateTime).isNotNull()
        assertThat(googleEvent.start.date).isNull()
        assertThat(googleEvent.end.dateTime).isNotNull()
        assertThat(googleEvent.end.date).isNull()

        // Check actual millis
        assertThat(googleEvent.start.dateTime.value).isEqualTo(start.toEpochMilli())
        assertThat(googleEvent.end.dateTime.value).isEqualTo(end.toEpochMilli())
    }

    // ─── toGoogleEvent: all-day path ──────────────────────────────────────────

    @Test
    fun `toGoogleEvent maps all-day EventCommand and adds 1 day back to end`() {
        // Our internal representation stores inclusive end (allDayEnd=2026-12-25)
        // Google expects exclusive end → stored end + 1 day = 2026-12-26
        val cmd = EventCommand(
            title = "Weihnachten",
            description = null,
            location = null,
            start = null,
            end = null,
            allDayStart = LocalDate.of(2026, 12, 25),
            allDayEnd = LocalDate.of(2026, 12, 25),
            isAllDay = true,
        )

        val googleEvent = mapper.toGoogleEvent(cmd)

        assertThat(googleEvent.summary).isEqualTo("Weihnachten")
        assertThat(googleEvent.description).isNull()
        assertThat(googleEvent.location).isNull()

        // start.date must be set, start.dateTime must be null
        assertThat(googleEvent.start.date).isNotNull()
        assertThat(googleEvent.start.dateTime).isNull()
        assertThat(googleEvent.end.date).isNotNull()
        assertThat(googleEvent.end.dateTime).isNull()

        // Verify date strings
        assertThat(googleEvent.start.date.toString()).isEqualTo("2026-12-25")
        // end exclusive = allDayEnd + 1 day
        assertThat(googleEvent.end.date.toString()).isEqualTo("2026-12-26")
    }

    @Test
    fun `toGoogleEvent maps multi-day all-day event with correct exclusive end`() {
        // Internal: start=2026-08-01, end=2026-08-04 (inclusive)
        // Google expected: start=2026-08-01, end=2026-08-05 (exclusive)
        val cmd = EventCommand(
            title = "Familienurlaub",
            description = null,
            location = null,
            start = null,
            end = null,
            allDayStart = LocalDate.of(2026, 8, 1),
            allDayEnd = LocalDate.of(2026, 8, 4),
            isAllDay = true,
        )

        val googleEvent = mapper.toGoogleEvent(cmd)

        assertThat(googleEvent.start.date.toString()).isEqualTo("2026-08-01")
        assertThat(googleEvent.end.date.toString()).isEqualTo("2026-08-05")
    }
}
