package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import java.util.UUID

data class CalendarView(
    val id: String,
    val summary: String,
    val backgroundColor: String?,
    val isPrimary: Boolean,
    val isSelected: Boolean,
)

private fun CalendarSubscription.toView() =
    CalendarView(
        id = googleCalendarId,
        summary = summary,
        backgroundColor = backgroundColor,
        isPrimary = isPrimary,
        isSelected = isSelected,
    )

@Service
class CalendarQueryService(
    private val connectionRepository: GoogleConnectionRepository,
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val calendarSyncService: CalendarSyncService,
) {
    fun listForMember(memberId: UUID): List<CalendarView> {
        val connection = connectionRepository.findByFamilyMemberId(memberId) ?: return emptyList()
        calendarSyncService.refreshCalendars(connection)
        return subscriptionRepository.findAllByConnectionId(connection.id!!).map { it.toView() }
    }

    fun saveSelection(
        memberId: UUID,
        calendarIds: List<String>,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val subscriptions = subscriptionRepository.findAllByConnectionId(connection.id!!)
        for (subscription in subscriptions) {
            subscription.isSelected = subscription.googleCalendarId in calendarIds
            subscriptionRepository.save(subscription)
        }
    }

    fun syncForMember(memberId: UUID): SyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return calendarSyncService.syncConnection(connection)
    }
}
