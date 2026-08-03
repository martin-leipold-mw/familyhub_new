package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMemberRepository
import org.springframework.stereotype.Service

/**
 * Löst die anzuzeigende Farbe je Kalender-Subscription auf:
 * - geteilt  → deterministische Farbe aus der Shared-Palette
 * - sonst    → Farbe des Konto-Mitglieds (connection → member → member.color)
 */
@Service
class CalendarColorResolver(
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val memberRepository: FamilyMemberRepository,
) {
    fun colorFor(subscription: CalendarSubscription): String =
        if (subscription.isShared) {
            SharedCalendarPalette.colorFor(subscription.googleCalendarId, sharedOrder())
        } else {
            val token =
                connectionRepository.findById(subscription.connectionId).orElse(null)
                    ?.let { memberRepository.findById(it.familyMemberId).orElse(null)?.color }
            MemberColorPalette.hex(token)
        }

    private fun sharedOrder(): List<String> =
        subscriptionRepository.findAllByIsSharedTrue()
            .map { it.googleCalendarId }
            .distinct()
            .sorted()
}
