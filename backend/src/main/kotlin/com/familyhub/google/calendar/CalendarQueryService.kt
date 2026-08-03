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
    val color: String,
    val isShared: Boolean,
    val isWriteTarget: Boolean,
    val ownerMemberId: UUID,
)

@Service
class CalendarQueryService(
    private val connectionRepository: GoogleConnectionRepository,
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val calendarSyncService: CalendarSyncService,
    private val colorResolver: CalendarColorResolver,
) {
    private fun CalendarSubscription.toView(ownerMemberId: UUID) =
        CalendarView(
            id = googleCalendarId,
            summary = summary,
            backgroundColor = backgroundColor,
            isPrimary = isPrimary,
            isSelected = isSelected,
            color = colorResolver.colorFor(this),
            isShared = isShared,
            isWriteTarget = isWriteTarget,
            ownerMemberId = ownerMemberId,
        )

    fun listForMember(memberId: UUID): List<CalendarView> {
        val connection = connectionRepository.findByFamilyMemberId(memberId) ?: return emptyList()
        calendarSyncService.refreshCalendars(connection)
        return subscriptionRepository.findAllByConnectionId(connection.id!!)
            .map { it.toView(connection.familyMemberId) }
    }

    fun listAll(): List<CalendarView> =
        connectionRepository.findAllByStatus("active").flatMap { connection ->
            subscriptionRepository.findAllByConnectionId(connection.id!!)
                .map { it.toView(connection.familyMemberId) }
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

    fun updateFlags(
        memberId: UUID,
        calendarId: String,
        isShared: Boolean?,
        isWriteTarget: Boolean?,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val target =
            subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connection.id!!, calendarId)
                ?: throw ResourceNotFoundException("Kalender nicht gefunden")
        if (isShared != null) target.isShared = isShared
        if (isWriteTarget == true) {
            subscriptionRepository.findAllByConnectionId(connection.id!!)
                .filter { it.isWriteTarget && it.id != target.id }
                .forEach {
                    it.isWriteTarget = false
                    subscriptionRepository.save(it)
                }
            target.isWriteTarget = true
        } else if (isWriteTarget == false) {
            target.isWriteTarget = false
        }
        subscriptionRepository.save(target)
    }

    fun syncForMember(memberId: UUID): SyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return calendarSyncService.syncConnection(connection)
    }
}
