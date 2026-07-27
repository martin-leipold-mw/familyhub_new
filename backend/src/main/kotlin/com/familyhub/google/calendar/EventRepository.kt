package com.familyhub.google.calendar

import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface EventRepository : JpaRepository<Event, UUID> {
    fun findByGoogleEventIdAndGoogleCalendarId(
        googleEventId: String,
        googleCalendarId: String,
    ): Event?

    fun deleteByGoogleEventIdAndGoogleCalendarId(
        googleEventId: String,
        googleCalendarId: String,
    )

    fun findByStartTimeBetween(
        start: Instant,
        end: Instant,
    ): List<Event>
}
