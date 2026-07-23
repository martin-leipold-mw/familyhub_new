package com.familyhub.google.calendar

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface CalendarSubscriptionRepository : JpaRepository<CalendarSubscription, UUID> {
    fun findAllByConnectionId(connectionId: UUID): List<CalendarSubscription>
    fun findByConnectionIdAndGoogleCalendarId(connectionId: UUID, googleCalendarId: String): CalendarSubscription?
    fun findAllByConnectionIdAndIsSelectedTrue(connectionId: UUID): List<CalendarSubscription>
}
