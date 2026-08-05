package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.ZoneOffset
import java.util.UUID

class OAuthStateStoreMemberIdTest {
    private val store = OAuthStateStore(Clock.systemUTC().let { Clock.fixed(it.instant(), ZoneOffset.UTC) })

    @Test
    fun `create stores and consume returns the memberId`() {
        val memberId = UUID.randomUUID()
        val state = store.create(UUID.randomUUID(), "/settings", "verifier", memberId)
        val entry = store.consume(state)
        assertThat(entry).isNotNull
        assertThat(entry!!.memberId).isEqualTo(memberId)
    }

    @Test
    fun `create without memberId defaults to null`() {
        val state = store.create(UUID.randomUUID(), "/settings", "verifier")
        assertThat(store.consume(state)!!.memberId).isNull()
    }
}
