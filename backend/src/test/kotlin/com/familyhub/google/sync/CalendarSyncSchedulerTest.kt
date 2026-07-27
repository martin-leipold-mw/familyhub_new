package com.familyhub.google.sync

import com.familyhub.google.calendar.CalendarSyncService
import com.familyhub.google.calendar.SyncResult
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

class CalendarSyncSchedulerTest {
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val calendarSyncService = mockk<CalendarSyncService>()
    private val scheduler = CalendarSyncScheduler(connectionRepository, calendarSyncService)

    private fun activeConnection(): GoogleConnection =
        GoogleConnection(
            familyMemberId = UUID.randomUUID(),
            credentialsId = null,
            googleAccountId = "acc@test.com",
            email = "acc@test.com",
            accessToken = null,
            refreshToken = "refresh",
            tokenExpiresAt = null,
            status = "active",
        )

    @BeforeEach
    fun resetGuard() {
        // ensure overlap guard is reset before each test
        scheduler.running.set(false)
    }

    @Test
    fun `runScheduledSync calls syncConnection for every active connection`() {
        val conn1 = activeConnection()
        val conn2 = activeConnection()
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn1, conn2)
        every { calendarSyncService.syncConnection(conn1) } returns SyncResult(1, 0, 0)
        every { calendarSyncService.syncConnection(conn2) } returns SyncResult(0, 2, 1)

        scheduler.runScheduledSync()

        verify(exactly = 1) { calendarSyncService.syncConnection(conn1) }
        verify(exactly = 1) { calendarSyncService.syncConnection(conn2) }
    }

    @Test
    fun `runScheduledSync isolates failure so second connection is still synced`() {
        val conn1 = activeConnection()
        val conn2 = activeConnection()
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn1, conn2)
        every { calendarSyncService.syncConnection(conn1) } throws RuntimeException("Google API error")
        every { calendarSyncService.syncConnection(conn2) } returns SyncResult(0, 1, 0)

        // must not throw
        scheduler.runScheduledSync()

        verify(exactly = 1) { calendarSyncService.syncConnection(conn1) }
        verify(exactly = 1) { calendarSyncService.syncConnection(conn2) }
    }

    @Test
    fun `runScheduledSync skips execution when overlap guard is already set`() {
        scheduler.running.set(true)

        scheduler.runScheduledSync()

        verify(exactly = 0) { connectionRepository.findAllByStatus(any()) }
        verify(exactly = 0) { calendarSyncService.syncConnection(any()) }
    }

    @Test
    fun `overlap guard is reset to false after successful run`() {
        every { connectionRepository.findAllByStatus("active") } returns emptyList()

        scheduler.runScheduledSync()

        assertThat(scheduler.running.get()).isFalse()
    }

    @Test
    fun `overlap guard is reset to false even if syncConnection throws`() {
        val conn = activeConnection()
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn)
        every { calendarSyncService.syncConnection(conn) } throws RuntimeException("boom")

        scheduler.runScheduledSync()

        assertThat(scheduler.running.get()).isFalse()
    }
}
