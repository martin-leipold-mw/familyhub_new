package com.familyhub.google.calendar

import com.google.api.client.util.DateTime
import com.google.api.services.calendar.model.EventDateTime
import com.google.api.services.calendar.model.EventReminder
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import com.google.api.services.calendar.model.Event as GoogleEvent

/**
 * Command object representing a local event to be pushed to Google Calendar.
 * allDayEnd is INCLUSIVE (the mapper adds +1 day when writing to Google).
 */
data class EventCommand(
    val title: String,
    val description: String? = null,
    val location: String? = null,
    val start: Instant? = null,
    val end: Instant? = null,
    val allDayStart: LocalDate? = null,
    val allDayEnd: LocalDate? = null,
    val isAllDay: Boolean,
    val reminderUseDefault: Boolean = true,
    val reminderMinutes: Int? = null,
    val recurrenceRule: String? = null,
)

@Component
class EventMapper {
    /**
     * Converts a Google Calendar Event into a local [Event] entity.
     *
     * - Timed events: start.dateTime / end.dateTime → UTC [Instant]s; isAllDay=false.
     * - All-day events: start.date / end.date → [LocalDate]; Google end is EXCLUSIVE so
     *   allDayEnd = end.date - 1 day; isAllDay=true; startTime/endTime null.
     * - Title fallback: summary ?: "Ohne Titel".
     */
    fun toEntity(
        google: GoogleEvent,
        subscription: CalendarSubscription,
        ownerMemberId: UUID,
    ): Event {
        val title = google.summary ?: "Ohne Titel"
        val googleUpdated = google.updated?.let { Instant.ofEpochMilli(it.value) }

        val isAllDay = google.start?.date != null

        val startTime: Instant?
        val endTime: Instant?
        val allDayStart: LocalDate?
        val allDayEnd: LocalDate?

        if (isAllDay) {
            startTime = null
            endTime = null
            allDayStart = localDateFromDateTime(google.start!!.date)
            // Google end is exclusive → subtract 1 day to make it inclusive
            allDayEnd = localDateFromDateTime(google.end!!.date).minusDays(1)
        } else {
            startTime = google.start?.dateTime?.let { Instant.ofEpochMilli(it.value) }
            endTime = google.end?.dateTime?.let { Instant.ofEpochMilli(it.value) }
            allDayStart = null
            allDayEnd = null
        }

        val reminderUseDefault = google.reminders?.useDefault ?: true
        val reminderMinutes =
            google.reminders?.overrides?.firstOrNull { it.method == "popup" }?.minutes

        return Event(
            subscriptionId = subscription.id!!,
            googleEventId = google.id,
            googleCalendarId = subscription.googleCalendarId,
            ownerMemberId = ownerMemberId,
            title = title,
            description = google.description,
            location = google.location,
            startTime = startTime,
            endTime = endTime,
            isAllDay = isAllDay,
            allDayStart = allDayStart,
            allDayEnd = allDayEnd,
            recurrenceId = google.recurringEventId,
            etag = google.etag,
            googleUpdated = googleUpdated,
            syncStatus = "synced",
            reminderUseDefault = reminderUseDefault,
            reminderMinutes = reminderMinutes,
        )
    }

    /**
     * Returns true if the Google event has been cancelled.
     */
    fun isCancelled(google: GoogleEvent): Boolean = google.status == "cancelled"

    /**
     * Converts an [EventCommand] into a Google Calendar Event ready for insert/update.
     *
     * - Timed: start/end [Instant]s → dateTime fields.
     * - All-day: allDayStart/allDayEnd [LocalDate]s → date fields;
     *   Google end is EXCLUSIVE so we add +1 day to the inclusive allDayEnd.
     */
    fun toGoogleEvent(cmd: EventCommand): GoogleEvent {
        val googleEvent =
            GoogleEvent()
                .setSummary(cmd.title)
                .setDescription(cmd.description)
                .setLocation(cmd.location)

        if (cmd.isAllDay) {
            googleEvent.start = EventDateTime().setDate(dateTimeFromLocalDate(cmd.allDayStart!!))
            // allDayEnd is inclusive; Google expects exclusive → add 1 day
            googleEvent.end = EventDateTime().setDate(dateTimeFromLocalDate(cmd.allDayEnd!!.plusDays(1)))
        } else {
            googleEvent.start = EventDateTime().setDateTime(DateTime(cmd.start!!.toEpochMilli()))
            googleEvent.end = EventDateTime().setDateTime(DateTime(cmd.end!!.toEpochMilli()))
        }

        googleEvent.reminders =
            if (cmd.reminderUseDefault) {
                GoogleEvent.Reminders().setUseDefault(true)
            } else {
                GoogleEvent.Reminders().setUseDefault(false).setOverrides(
                    cmd.reminderMinutes?.let {
                        listOf(EventReminder().setMethod("popup").setMinutes(it))
                    } ?: emptyList(),
                )
            }

        if (cmd.recurrenceRule != null) {
            googleEvent.recurrence = listOf(cmd.recurrenceRule)
        }

        return googleEvent
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * Converts a date-only [DateTime] (e.g. "2026-07-01") to a [LocalDate].
     * Google date-only DateTimes are parsed as UTC midnight; we extract just the date part.
     */
    private fun localDateFromDateTime(dt: DateTime): LocalDate {
        // DateTime("2026-07-01") stores value as UTC midnight millis of that date.
        return Instant.ofEpochMilli(dt.value).atOffset(java.time.ZoneOffset.UTC).toLocalDate()
    }

    /**
     * Converts a [LocalDate] to a date-only [DateTime] suitable for Google Calendar.
     * Uses the RFC 3339 date string format "YYYY-MM-DD".
     */
    private fun dateTimeFromLocalDate(date: LocalDate): DateTime {
        return DateTime(date.toString()) // e.g. "2026-07-01"
    }
}
