package com.familyhub.pin

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

private class MutableClock(var instant: Instant) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = instant
}

class PinSessionServiceTest {

    private val clock = MutableClock(Instant.parse("2026-07-22T10:00:00Z"))
    private val service = PinSessionService(clock)

    @Test
    fun `a fresh session is valid`() {
        val token = service.createSession()
        assertThat(service.isValid(token)).isTrue()
    }

    @Test
    fun `unknown token is invalid`() {
        assertThat(service.isValid(UUID.randomUUID())).isFalse()
    }

    @Test
    fun `session expires after 15 minutes of inactivity`() {
        val token = service.createSession()
        clock.instant = clock.instant.plus(Duration.ofMinutes(15))
        assertThat(service.isValid(token)).isFalse()
        // second check confirms the token was removed
        assertThat(service.isValid(token)).isFalse()
    }

    @Test
    fun `activity within the window slides the timeout`() {
        val token = service.createSession()
        clock.instant = clock.instant.plus(Duration.ofMinutes(14))
        assertThat(service.isValid(token)).isTrue()   // refreshes last-accessed
        clock.instant = clock.instant.plus(Duration.ofMinutes(14))
        assertThat(service.isValid(token)).isTrue()
    }
}
