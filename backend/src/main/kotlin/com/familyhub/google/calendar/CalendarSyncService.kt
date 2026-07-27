package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.google.api.client.util.DateTime
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

data class SyncResult(
    val created: Int,
    val updated: Int,
    val deleted: Int,
)

@Service
class CalendarSyncService(
    private val calendarClient: GoogleCalendarClient,
    private val subscriptionRepo: CalendarSubscriptionRepository,
    private val eventRepo: EventRepository,
    private val connectionRepo: GoogleConnectionRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val mapper = EventMapper()

    /**
     * Refreshes the list of calendar subscriptions for the given connection.
     * - New calendars: insert with isSelected=false.
     * - Existing calendars: update summary, backgroundColor, isPrimary; preserve isSelected.
     */
    fun refreshCalendars(connection: GoogleConnection) {
        val connectionId = connection.id!!
        val calendars = calendarClient.listCalendars(connection)
        for (info in calendars) {
            val existing = subscriptionRepo.findByConnectionIdAndGoogleCalendarId(connectionId, info.id)
            if (existing == null) {
                val sub =
                    CalendarSubscription(
                        connectionId = connectionId,
                        googleCalendarId = info.id,
                        summary = info.summary,
                        backgroundColor = info.backgroundColor,
                        isPrimary = info.primary,
                        isSelected = false,
                    )
                subscriptionRepo.save(sub)
            } else {
                existing.summary = info.summary
                existing.backgroundColor = info.backgroundColor
                existing.isPrimary = info.primary
                // isSelected is NOT changed
                subscriptionRepo.save(existing)
            }
        }
    }

    /**
     * Syncs all selected calendar subscriptions for one connection.
     * - Skips connections with status != "active".
     * - Incremental sync using syncToken; falls back to full resync on 410 (fullResyncRequired).
     * - Full resync window: now - 1 month … now + 12 months.
     * - cancelled events → local delete.
     * - New syncToken saved on subscription; lastSyncedAt set on connection.
     */
    fun syncConnection(connection: GoogleConnection): SyncResult {
        if (connection.status != "active") {
            return SyncResult(0, 0, 0)
        }

        val connectionId = connection.id!!
        val subscriptions = subscriptionRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId)

        var totalCreated = 0
        var totalUpdated = 0
        var totalDeleted = 0

        for (subscription in subscriptions) {
            val (created, updated, deleted) = syncSubscription(connection, subscription)
            totalCreated += created
            totalUpdated += updated
            totalDeleted += deleted
        }

        connection.lastSyncedAt = Instant.now(clock)
        connectionRepo.save(connection)

        return SyncResult(totalCreated, totalUpdated, totalDeleted)
    }

    /**
     * Syncs events for a single subscription.
     */
    private fun syncSubscription(
        connection: GoogleConnection,
        subscription: CalendarSubscription,
    ): SyncResult {
        val calendarId = subscription.googleCalendarId

        // Try incremental sync with existing syncToken
        var page = calendarClient.listEvents(connection, calendarId, subscription.syncToken, null, null)

        if (page.fullResyncRequired) {
            // Full resync: -1 month to +12 months window
            val now = Instant.now(clock)
            val timeMin = now.atOffset(ZoneOffset.UTC).minusMonths(1).toInstant()
            val timeMax = now.atOffset(ZoneOffset.UTC).plusMonths(12).toInstant()
            val googleTimeMin = DateTime(timeMin.toEpochMilli())
            val googleTimeMax = DateTime(timeMax.toEpochMilli())
            page = calendarClient.listEvents(connection, calendarId, null, googleTimeMin, googleTimeMax)
        }

        var created = 0
        var updated = 0
        var deleted = 0

        for (googleEvent in page.events) {
            if (mapper.isCancelled(googleEvent)) {
                eventRepo.deleteByGoogleEventIdAndGoogleCalendarId(googleEvent.id, calendarId)
                deleted++
            } else {
                val existing = eventRepo.findByGoogleEventIdAndGoogleCalendarId(googleEvent.id, calendarId)
                if (existing == null) {
                    val newEntity = mapper.toEntity(googleEvent, subscription, connection.familyMemberId)
                    eventRepo.save(newEntity)
                    created++
                } else {
                    // "Google wins": overwrite local fields with Google data
                    val mapped = mapper.toEntity(googleEvent, subscription, connection.familyMemberId)
                    existing.title = mapped.title
                    existing.description = mapped.description
                    existing.location = mapped.location
                    existing.startTime = mapped.startTime
                    existing.endTime = mapped.endTime
                    existing.isAllDay = mapped.isAllDay
                    existing.allDayStart = mapped.allDayStart
                    existing.allDayEnd = mapped.allDayEnd
                    existing.recurrenceId = mapped.recurrenceId
                    existing.etag = mapped.etag
                    existing.googleUpdated = mapped.googleUpdated
                    existing.syncStatus = "synced"
                    eventRepo.save(existing)
                    updated++
                }
            }
        }

        subscription.syncToken = page.nextSyncToken
        subscriptionRepo.save(subscription)

        return SyncResult(created, updated, deleted)
    }

    /**
     * Syncs all active connections.
     */
    fun syncAll() {
        val activeConnections = connectionRepo.findAllByStatus("active")
        for (connection in activeConnections) {
            syncConnection(connection)
        }
    }
}
