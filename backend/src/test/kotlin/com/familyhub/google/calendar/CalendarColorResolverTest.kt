package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class CalendarColorResolverTest {
    private val subscriptionRepository = mockk<CalendarSubscriptionRepository>()
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val resolver = CalendarColorResolver(subscriptionRepository, connectionRepository, memberRepository)

    private val memberId = UUID.randomUUID()
    private val connectionId = UUID.randomUUID()

    private fun sub(
        calId: String,
        shared: Boolean,
    ) = CalendarSubscription(connectionId = connectionId, googleCalendarId = calId, summary = calId, isShared = shared)

    @Test
    fun `personal calendar inherits the member color`() {
        val connection =
            GoogleConnection(
                familyMemberId = memberId,
                credentialsId = null,
                googleAccountId = "g",
                email = "e",
                accessToken = null,
                refreshToken = "r",
                tokenExpiresAt = null,
                status = "active",
            ).also { it.id = connectionId }
        val member = FamilyMember(name = "Papa", role = "parent", color = "green").also { it.id = memberId }
        every { connectionRepository.findById(connectionId) } returns Optional.of(connection)
        every { memberRepository.findById(memberId) } returns Optional.of(member)

        assertThat(resolver.colorFor(sub("personal", shared = false))).isEqualTo("hsl(140 60% 65%)")
    }

    @Test
    fun `shared calendar gets a shared-palette color by global sorted order`() {
        every { subscriptionRepository.findAllByIsSharedTrue() } returns
            listOf(sub("birthdays", true), sub("holidays", true)) // sorted → birthdays[0], holidays[1]

        assertThat(resolver.colorFor(sub("holidays", shared = true))).isEqualTo(SharedCalendarPalette.COLORS[1])
    }

    @Test
    fun `personal calendar with no matching connection falls back to the default color`() {
        every { connectionRepository.findById(connectionId) } returns Optional.empty()

        assertThat(resolver.colorFor(sub("orphaned", shared = false))).isEqualTo(MemberColorPalette.hex(null))
    }

    @Test
    fun `personal calendar with no matching member falls back to the default color`() {
        val connection =
            GoogleConnection(
                familyMemberId = memberId,
                credentialsId = null,
                googleAccountId = "g",
                email = "e",
                accessToken = null,
                refreshToken = "r",
                tokenExpiresAt = null,
                status = "active",
            ).also { it.id = connectionId }
        every { connectionRepository.findById(connectionId) } returns Optional.of(connection)
        every { memberRepository.findById(memberId) } returns Optional.empty()

        assertThat(resolver.colorFor(sub("orphaned", shared = false))).isEqualTo(MemberColorPalette.hex(null))
    }

    @Test
    fun `same shared calendar id resolves to the same color regardless of connection`() {
        every { subscriptionRepository.findAllByIsSharedTrue() } returns
            listOf(
                CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true),
                CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true),
            )
        val a = CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true)
        val b = CalendarSubscription(connectionId = UUID.randomUUID(), googleCalendarId = "holidays", summary = "H", isShared = true)

        assertThat(resolver.colorFor(a)).isEqualTo(resolver.colorFor(b))
    }
}
