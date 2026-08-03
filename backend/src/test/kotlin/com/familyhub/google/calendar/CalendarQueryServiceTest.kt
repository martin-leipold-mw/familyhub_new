package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

class CalendarQueryServiceTest {
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val subscriptionRepository = mockk<CalendarSubscriptionRepository>()
    private val calendarSyncService = mockk<CalendarSyncService>()
    private val colorResolver = mockk<CalendarColorResolver>()

    private lateinit var service: CalendarQueryService

    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val connectionId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")

    private val connection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g123",
            email = "anna@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            status = "active",
            lastSyncedAt = null,
        ).also { it.id = connectionId }

    @BeforeEach
    fun setUp() {
        service = CalendarQueryService(connectionRepository, subscriptionRepository, calendarSyncService, colorResolver)
        every { colorResolver.colorFor(any()) } returns "hsl(140 60% 65%)"
    }

    // ─── listForMember: connection present ────────────────────────────────────

    @Test
    fun `listForMember with connection present calls refreshCalendars and maps subscriptions`() {
        val sub1 =
            CalendarSubscription(
                connectionId = connectionId,
                googleCalendarId = "cal1@gmail.com",
                summary = "Family",
                backgroundColor = "#ff0000",
                isPrimary = true,
                isSelected = true,
            ).also { it.id = UUID.randomUUID() }

        val sub2 =
            CalendarSubscription(
                connectionId = connectionId,
                googleCalendarId = "cal2@gmail.com",
                summary = "Work",
                backgroundColor = null,
                isPrimary = false,
                isSelected = false,
            ).also { it.id = UUID.randomUUID() }

        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        justRun { calendarSyncService.refreshCalendars(connection) }
        every { subscriptionRepository.findAllByConnectionId(connectionId) } returns listOf(sub1, sub2)

        val result = service.listForMember(memberId)

        verify(exactly = 1) { calendarSyncService.refreshCalendars(connection) }

        assertThat(result).hasSize(2)
        assertThat(result[0].id).isEqualTo("cal1@gmail.com")
        assertThat(result[0].summary).isEqualTo("Family")
        assertThat(result[0].backgroundColor).isEqualTo("#ff0000")
        assertThat(result[0].isPrimary).isTrue()
        assertThat(result[0].isSelected).isTrue()
        assertThat(result[1].id).isEqualTo("cal2@gmail.com")
        assertThat(result[1].backgroundColor).isNull()
        assertThat(result[1].isSelected).isFalse()
    }

    // ─── listForMember: connection null → empty list, refresh NOT called ──────

    @Test
    fun `listForMember with no connection returns empty list and does not call refreshCalendars`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        val result = service.listForMember(memberId)

        assertThat(result).isEmpty()
        verify(exactly = 0) { calendarSyncService.refreshCalendars(any()) }
        verify(exactly = 0) { subscriptionRepository.findAllByConnectionId(any()) }
    }

    // ─── saveSelection: sets isSelected per membership ────────────────────────

    @Test
    fun `saveSelection sets isSelected true for included ids and false for excluded ids`() {
        val subIncluded =
            CalendarSubscription(
                connectionId = connectionId,
                googleCalendarId = "cal1@gmail.com",
                summary = "Family",
                isSelected = false,
            ).also { it.id = UUID.randomUUID() }

        val subExcluded =
            CalendarSubscription(
                connectionId = connectionId,
                googleCalendarId = "cal2@gmail.com",
                summary = "Work",
                isSelected = true,
            ).also { it.id = UUID.randomUUID() }

        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { subscriptionRepository.findAllByConnectionId(connectionId) } returns listOf(subIncluded, subExcluded)
        every { subscriptionRepository.save(any()) } answers { firstArg() }

        service.saveSelection(memberId, listOf("cal1@gmail.com"))

        // cal1 included → true
        assertThat(subIncluded.isSelected).isTrue()
        // cal2 excluded → false
        assertThat(subExcluded.isSelected).isFalse()
        verify(exactly = 2) { subscriptionRepository.save(any()) }
    }

    // ─── saveSelection: connection null → ResourceNotFoundException ───────────

    @Test
    fun `saveSelection throws ResourceNotFoundException when no connection found`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        assertThatThrownBy { service.saveSelection(memberId, listOf("cal1@gmail.com")) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Keine Google-Verbindung")

        verify(exactly = 0) { subscriptionRepository.findAllByConnectionId(any()) }
        verify(exactly = 0) { subscriptionRepository.save(any()) }
    }

    // ─── syncForMember: connection present → returns SyncResult ──────────────

    @Test
    fun `syncForMember with connection present delegates to calendarSyncService`() {
        val expectedResult = SyncResult(created = 3, updated = 1, deleted = 2)

        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { calendarSyncService.syncConnection(connection) } returns expectedResult

        val result = service.syncForMember(memberId)

        assertThat(result.created).isEqualTo(3)
        assertThat(result.updated).isEqualTo(1)
        assertThat(result.deleted).isEqualTo(2)
        verify(exactly = 1) { calendarSyncService.syncConnection(connection) }
    }

    // ─── syncForMember: connection null → ResourceNotFoundException ───────────

    @Test
    fun `syncForMember throws ResourceNotFoundException when no connection found`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        assertThatThrownBy { service.syncForMember(memberId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Keine Google-Verbindung")

        verify(exactly = 0) { calendarSyncService.syncConnection(any()) }
    }

    // ─── listAll: aggregates across all active connections ────────────────────

    @Test
    fun `listAll aggregates calendars across all active connections with resolved color`() {
        val conn1 = connectionWith(UUID.randomUUID())
        val conn2 = connectionWith(UUID.randomUUID())
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn1, conn2)
        every { subscriptionRepository.findAllByConnectionId(conn1.id!!) } returns
            listOf(CalendarSubscription(connectionId = conn1.id!!, googleCalendarId = "a", summary = "A", isSelected = true))
        every { subscriptionRepository.findAllByConnectionId(conn2.id!!) } returns
            listOf(CalendarSubscription(connectionId = conn2.id!!, googleCalendarId = "b", summary = "B", isShared = true))

        val result = service.listAll()

        assertThat(result.map { it.id }).containsExactly("a", "b")
        assertThat(result[0].ownerMemberId).isEqualTo(conn1.familyMemberId)
        assertThat(result[0].color).isEqualTo("hsl(140 60% 65%)")
    }

    // ─── updateFlags: sets isShared and moves write target exclusively ────────

    @Test
    fun `updateFlags sets isShared and moves the write target exclusively`() {
        val conn = connectionWith(UUID.randomUUID())
        val old = CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "old", summary = "Old", isWriteTarget = true).also { it.id = UUID.randomUUID() }
        val target = CalendarSubscription(connectionId = conn.id!!, googleCalendarId = "new", summary = "New").also { it.id = UUID.randomUUID() }
        every { connectionRepository.findByFamilyMemberId(conn.familyMemberId) } returns conn
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(conn.id!!, "new") } returns target
        every { subscriptionRepository.findAllByConnectionId(conn.id!!) } returns listOf(old, target)
        every { subscriptionRepository.save(any()) } answers { firstArg() }

        service.updateFlags(conn.familyMemberId, "new", isShared = true, isWriteTarget = true)

        assertThat(target.isShared).isTrue()
        assertThat(target.isWriteTarget).isTrue()
        assertThat(old.isWriteTarget).isFalse()
    }

    @Test
    fun `updateFlags throws when the calendar is unknown`() {
        val conn = connectionWith(UUID.randomUUID())
        every { connectionRepository.findByFamilyMemberId(conn.familyMemberId) } returns conn
        every { subscriptionRepository.findByConnectionIdAndGoogleCalendarId(conn.id!!, "ghost") } returns null

        assertThatThrownBy { service.updateFlags(conn.familyMemberId, "ghost", isShared = true, isWriteTarget = null) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    private fun connectionWith(memberId: UUID) =
        GoogleConnection(
            familyMemberId = memberId, credentialsId = null, googleAccountId = "g-$memberId", email = "e",
            accessToken = null, refreshToken = "r", tokenExpiresAt = null, status = "active",
        ).also { it.id = UUID.randomUUID() }
}
