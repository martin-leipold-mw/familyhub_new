package com.familyhub.google.sync

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler

/**
 * Guards the fix for the finding that [TaskSyncScheduler] and CalendarSyncScheduler are
 * not actually independent: without an explicit `spring.task.scheduling.pool.size`,
 * Spring Boot's default scheduling pool has exactly one thread, so both @Scheduled
 * methods serialise on it and a hanging calendar run delays the task run — contrary to
 * TaskSyncScheduler's own doc comment. application.yml sets the pool size to 2 so both
 * schedulers can run concurrently.
 */
class SchedulingConfigIntegrationTest : BaseIntegrationTest() {
    @Autowired
    private lateinit var taskScheduler: ThreadPoolTaskScheduler

    @Test
    fun `scheduling pool has two threads so a hanging calendar run cannot block the task run`() {
        assertThat(taskScheduler.poolSize).isEqualTo(2)
    }
}
