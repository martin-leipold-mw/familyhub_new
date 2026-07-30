package com.familyhub.google.calendar

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.PreUpdate
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Entity
@Table(name = "events")
class Event(
    @Column(name = "subscription_id", nullable = false)
    var subscriptionId: UUID,
    @Column(name = "google_event_id", nullable = false)
    var googleEventId: String,
    @Column(name = "google_calendar_id", nullable = false)
    var googleCalendarId: String,
    @Column(name = "owner_member_id", nullable = false)
    var ownerMemberId: UUID,
    @Column(nullable = false)
    var title: String,
    @Column
    var description: String? = null,
    @Column
    var location: String? = null,
    @Column(name = "start_time")
    var startTime: Instant? = null,
    @Column(name = "end_time")
    var endTime: Instant? = null,
    @Column(name = "is_all_day", nullable = false)
    var isAllDay: Boolean = false,
    @Column(name = "all_day_start")
    var allDayStart: LocalDate? = null,
    @Column(name = "all_day_end")
    var allDayEnd: LocalDate? = null,
    @Column(name = "recurrence_id")
    var recurrenceId: String? = null,
    @Column(name = "reminder_use_default", nullable = false)
    var reminderUseDefault: Boolean = true,
    @Column(name = "reminder_minutes")
    var reminderMinutes: Int? = null,
    @Column
    var etag: String? = null,
    @Column(name = "google_updated")
    var googleUpdated: Instant? = null,
    @Column(name = "sync_status", nullable = false)
    var syncStatus: String = "synced",
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist
    protected fun onCreate() {
        val now = Instant.now()
        createdAt = now
        updatedAt = now
    }

    @PreUpdate
    protected fun onUpdate() {
        updatedAt = Instant.now()
    }
}
