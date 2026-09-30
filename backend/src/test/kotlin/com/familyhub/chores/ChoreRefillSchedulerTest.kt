package com.familyhub.chores

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ChoreRefillSchedulerTest {
    private val refillService = mockk<ChoreRefillService>()
    private val scheduler = ChoreRefillScheduler(refillService)

    @Test
    fun `der geplante Lauf ruft den Ausgabelauf auf`() {
        every { refillService.refillAll() } returns RefillResult(assigned = 2, waiting = 1)

        scheduler.runScheduledRefill()

        verify(exactly = 1) { refillService.refillAll() }
        assertThat(scheduler.running.get()).isFalse()
    }

    @Test
    fun `der Startlauf ruft denselben Ausgabelauf auf`() {
        every { refillService.refillAll() } returns RefillResult(assigned = 0, waiting = 0)

        scheduler.runStartupRefill()

        verify(exactly = 1) { refillService.refillAll() }
    }

    @Test
    fun `ein bereits laufender Lauf wird uebersprungen`() {
        scheduler.running.set(true)

        scheduler.runScheduledRefill()

        verify(exactly = 0) { refillService.refillAll() }
    }

    @Test
    fun `der Guard wird auch nach einem Fehler wieder freigegeben`() {
        every { refillService.refillAll() } throws IllegalStateException("Datenbank weg")

        runCatching { scheduler.runScheduledRefill() }

        assertThat(scheduler.running.get()).isFalse()
    }
}
