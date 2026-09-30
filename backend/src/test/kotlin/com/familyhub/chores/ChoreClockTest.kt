package com.familyhub.chores

import com.familyhub.settings.SettingsService
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

class ChoreClockTest {
    private val settingsService = mockk<SettingsService>()

    // 22:30 UTC am 22.09. ist in Europe/Berlin bereits der 23.09. — genau das
    // Fenster, in dem das Altsystem abends den Folgetag anzeigte.
    private val fixed = Instant.parse("2026-09-22T22:30:00Z")
    private val choreClock = ChoreClock(Clock.fixed(fixed, ZoneOffset.UTC), settingsService)

    @Test
    fun `today rechnet in der Haushaltszeitzone`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        assertThat(choreClock.today()).isEqualTo(LocalDate.of(2026, 9, 23))
    }

    @Test
    fun `today folgt einer abweichenden Zeitzone`() {
        every { settingsService.timezone() } returns "UTC"

        assertThat(choreClock.today()).isEqualTo(LocalDate.of(2026, 9, 22))
    }

    @Test
    fun `now liefert den Zeitpunkt der Uhr`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        assertThat(choreClock.now()).isEqualTo(fixed)
    }

    @Test
    fun `startOfToday ist Mitternacht der Haushaltszeitzone`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        // 23.09. 00:00 Berlin (UTC+2) = 22.09. 22:00 UTC
        assertThat(choreClock.startOfToday()).isEqualTo(Instant.parse("2026-09-22T22:00:00Z"))
    }
}
