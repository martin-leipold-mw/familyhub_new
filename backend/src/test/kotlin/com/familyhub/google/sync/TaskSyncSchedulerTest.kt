package com.familyhub.google.sync

import com.familyhub.google.tasks.TaskSyncService
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class TaskSyncSchedulerTest {
    private val taskSyncService = mockk<TaskSyncService>()
    private val scheduler = TaskSyncScheduler(taskSyncService)

    @BeforeEach
    fun resetGuard() {
        // ensure overlap guard is reset before each test
        scheduler.running.set(false)
    }

    @Test
    fun `calls syncAll on the task sync service`() {
        every { taskSyncService.syncAll() } just runs

        scheduler.runScheduledSync()

        verify(exactly = 1) { taskSyncService.syncAll() }
    }

    @Test
    fun `skips the run while a previous one is still in progress`() {
        scheduler.running.set(true)

        scheduler.runScheduledSync()

        verify(exactly = 0) { taskSyncService.syncAll() }
    }

    @Test
    fun `releases the guard after an exception`() {
        every { taskSyncService.syncAll() } throws RuntimeException("boom")

        scheduler.runScheduledSync()

        assertThat(scheduler.running.get()).isFalse()
    }
}
