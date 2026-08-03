package com.familyhub.google.calendar

import com.familyhub.BaseIntegrationTest
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

/**
 * Exercises [CalendarQueryService.updateFlags]'s "move the write target" branch against the
 * real partial unique index (`idx_calendar_subscriptions_write_target`, V10), which allows at
 * most one `is_write_target = TRUE` row per connection and is non-deferrable.
 *
 * `updateFlags` is not `@Transactional` itself, so whether the "clear old target" and "set new
 * target" updates land in one flush (and in which order) depends on the transactional context of
 * the caller. Wrapping the whole test in `@Transactional` (as this class does) reproduces the
 * worst case: both repository saves join the single ambient transaction and are only flushed
 * together, e.g. by the assertion query below — exactly the scenario the risk describes.
 */
@Transactional
class CalendarWriteTargetMoveIntegrationTest
    @Autowired
    constructor(
        private val members: FamilyMemberRepository,
        private val connections: GoogleConnectionRepository,
        private val subscriptions: CalendarSubscriptionRepository,
        private val service: CalendarQueryService,
    ) : BaseIntegrationTest() {
        private fun connection(): GoogleConnection {
            val member = members.save(FamilyMember(name = "Mama", role = "parent", color = "blue"))
            return connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!,
                    credentialsId = null,
                    googleAccountId = "acc-${member.id}",
                    email = "mama@example.com",
                    accessToken = null,
                    refreshToken = "refresh",
                    tokenExpiresAt = null,
                    status = "active",
                ),
            )
        }

        @Test
        fun `moving the write target to another calendar does not violate the unique index`() {
            val conn = connection()
            subscriptions.save(
                CalendarSubscription(
                    connectionId = conn.id!!,
                    googleCalendarId = "cal-a",
                    summary = "A",
                    isWriteTarget = true,
                ),
            )
            val subB =
                subscriptions.save(
                    CalendarSubscription(
                        connectionId = conn.id!!,
                        googleCalendarId = "cal-b",
                        summary = "B",
                        isWriteTarget = false,
                    ),
                )

            service.updateFlags(
                memberId = conn.familyMemberId,
                calendarId = subB.googleCalendarId,
                isShared = null,
                isWriteTarget = true,
            )
            // Force the flush here rather than relying on transaction commit, so the assertion
            // below fails with the real DataIntegrityViolationException if the move is unsafe.
            subscriptions.flush()

            val reloaded = subscriptions.findAllByConnectionId(conn.id!!)
            val writeTargets = reloaded.filter { it.isWriteTarget }
            assertThat(writeTargets).hasSize(1)
            assertThat(writeTargets.single().googleCalendarId).isEqualTo("cal-b")
            assertThat(reloaded.first { it.googleCalendarId == "cal-a" }.isWriteTarget).isFalse()
        }

        @Test
        fun `setting the write target when none exists yet succeeds`() {
            val conn = connection()
            val subX =
                subscriptions.save(
                    CalendarSubscription(
                        connectionId = conn.id!!,
                        googleCalendarId = "cal-x",
                        summary = "X",
                        isWriteTarget = false,
                    ),
                )

            service.updateFlags(
                memberId = conn.familyMemberId,
                calendarId = subX.googleCalendarId,
                isShared = null,
                isWriteTarget = true,
            )
            subscriptions.flush()

            val reloaded = subscriptions.findById(subX.id!!).get()
            assertThat(reloaded.isWriteTarget).isTrue()
        }
    }
