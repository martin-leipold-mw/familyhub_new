package com.familyhub.google.calendar

import com.familyhub.generated.api.EventsApi
import com.familyhub.generated.model.EventCreateRequest
import com.familyhub.generated.model.EventResponse
import com.familyhub.settings.SettingsService
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID

@RestController
@RequestMapping("/api")
class EventController(
    private val eventService: EventService,
    private val settingsService: SettingsService,
) : EventsApi {

    /**
     * Parses an ISO-8601 string to an Instant.
     *
     * Branches:
     * 1. null → null
     * 2. Full instant (e.g. "2026-07-24T10:00:00Z") → Instant.parse succeeds
     * 3. Date-only (e.g. "2026-07-24") → fallback: start of that day in family timezone
     * 4. Garbage → throws ValidationException → 400
     */
    private fun parseInstant(s: String?): Instant? {
        if (s == null) return null
        try {
            return Instant.parse(s)
        } catch (e: DateTimeException) {
            // fall through to date-only parse
        }
        try {
            return LocalDate.parse(s).atStartOfDay(ZoneId.of(settingsService.timezone())).toInstant()
        } catch (e: DateTimeException) {
            throw ValidationException("Ungültiges Datumsformat")
        }
    }

    override fun listEvents(
        start: String?,
        end: String?,
        memberId: UUID?,
        calendarId: String?,
    ): ResponseEntity<List<EventResponse>> =
        ResponseEntity.ok(
            eventService.list(parseInstant(start), parseInstant(end), memberId, calendarId)
                .map { it.toResponse() }
        )

    override fun getEvent(id: UUID): ResponseEntity<EventResponse> =
        ResponseEntity.ok(eventService.get(id).toResponse())

    override fun createEvent(eventCreateRequest: EventCreateRequest): ResponseEntity<EventResponse> =
        ResponseEntity.status(201).body(eventService.create(eventCreateRequest.toCommand()).toResponse())

    override fun updateEvent(id: UUID, eventCreateRequest: EventCreateRequest): ResponseEntity<EventResponse> =
        ResponseEntity.ok(eventService.update(id, eventCreateRequest.toCommand()).toResponse())

    override fun deleteEvent(id: UUID): ResponseEntity<Unit> {
        eventService.delete(id)
        return ResponseEntity.noContent().build()
    }

    // Reuses parseInstant so body start/end get the same handling as the GET
    // query params: garbage → ValidationException → 400, date-only → timezone-
    // resolved start of day. Needs settingsService, hence a member method (not a
    // standalone extension). Adds no new branches — parseInstant's branches are
    // already covered by the GET tests.
    private fun EventCreateRequest.toCommand() = CreateEventCommand(
        memberId = memberId,
        calendarId = calendarId,
        title = title,
        description = description,
        location = location,
        start = parseInstant(start),
        end = parseInstant(end),
        allDayStart = allDayStart,
        allDayEnd = allDayEnd,
        isAllDay = isAllDay,
    )
}

private fun EventView.toResponse() = EventResponse(
    id = id,
    title = title,
    description = description,
    location = location,
    start = start?.let { OffsetDateTime.ofInstant(it, ZoneId.of("UTC")) },
    end = end?.let { OffsetDateTime.ofInstant(it, ZoneId.of("UTC")) },
    isAllDay = isAllDay,
    allDayStart = allDayStart,
    allDayEnd = allDayEnd,
    memberId = memberId,
    calendarId = calendarId,
)
