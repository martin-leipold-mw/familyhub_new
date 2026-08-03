package com.familyhub.google.calendar

import com.familyhub.BaseIntegrationTest
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.transaction.annotation.Transactional

@Transactional
class CalendarSubscriptionFlagsIntegrationTest
    @Autowired
    constructor(
        private val members: FamilyMemberRepository,
        private val connections: GoogleConnectionRepository,
        private val subscriptions: CalendarSubscriptionRepository,
    ) : BaseIntegrationTest() {
        private fun connection(): GoogleConnection {
            val member = members.save(FamilyMember(name = "Papa", role = "parent", color = "green"))
            return connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!,
                    credentialsId = null,
                    googleAccountId = "acc-${member.id}",
                    email = "papa@example.com",
                    accessToken = null,
                    refreshToken = "refresh",
                    tokenExpiresAt = null,
                    status = "active",
                ),
            )
        }

        @Test
        fun `flags default to false and persist true`() {
            val conn = connection()
            val saved =
                subscriptions.save(
                    CalendarSubscription(
                        connectionId = conn.id!!,
                        googleCalendarId = "cal-a",
                        summary = "A",
                        isShared = true,
                        isWriteTarget = true,
                    ),
                )
            val reloaded = subscriptions.findById(saved.id!!).get()
            assertThat(reloaded.isShared).isTrue()
            assertThat(reloaded.isWriteTarget).isTrue()
        }

        @Test
        fun `findAllByIsSharedTrue returns only shared subscriptions`() {
            val conn = connection()
            subscriptions.save(CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "s", summary = "S", isShared = true))
            subscriptions.save(CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "p", summary = "P", isShared = false))
            assertThat(subscriptions.findAllByIsSharedTrue().map { it.googleCalendarId }).containsExactly("s")
        }

        @Test
        fun `a second write target on the same connection is rejected`() {
            val conn = connection()
            subscriptions.save(
                CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "cal-1", summary = "1", isWriteTarget = true),
            )
            assertThatThrownBy {
                subscriptions.saveAndFlush(
                    CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "cal-2", summary = "2", isWriteTarget = true),
                )
            }.isInstanceOf(DataIntegrityViolationException::class.java)
        }
    }
