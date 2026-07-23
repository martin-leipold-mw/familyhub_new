package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class OAuthStateStoreTest {
    private val fixed = Instant.parse("2026-07-23T10:00:00Z")

    @Test fun `create then consume returns the entry once`() {
        val store = OAuthStateStore(Clock.fixed(fixed, ZoneOffset.UTC))
        val id = UUID.randomUUID()
        val state = store.create(id, "/setup", "verifier")
        val e = store.consume(state)
        assertThat(e).isNotNull
        assertThat(e!!.credentialsId).isEqualTo(id)
        assertThat(e.returnUrl).isEqualTo("/setup")
        assertThat(store.consume(state)).isNull() // single-use
    }

    @Test fun `consume returns null for unknown state`() {
        val store = OAuthStateStore(Clock.fixed(fixed, ZoneOffset.UTC))
        assertThat(store.consume("nope")).isNull()
    }

    @Test fun `consume returns null after TTL`() {
        val clock = MutableClock(fixed)
        val store = OAuthStateStore(clock)
        val state = store.create(null, "/", "v")
        clock.advance(Duration.ofMinutes(11))
        assertThat(store.consume(state)).isNull()
    }

    private class MutableClock(var now: Instant) : Clock() {
        fun advance(d: Duration) { now = now.plus(d) }
        override fun instant() = now
        override fun getZone() = ZoneOffset.UTC
        override fun withZone(z: java.time.ZoneId?) = this
    }
}
