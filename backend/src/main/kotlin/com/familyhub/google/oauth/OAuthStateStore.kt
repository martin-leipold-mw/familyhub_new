package com.familyhub.google.oauth

import org.springframework.stereotype.Component
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class OAuthStateEntry(val credentialsId: UUID?, val returnUrl: String, val verifier: String)

@Component
class OAuthStateStore(private val clock: Clock) {
    private data class Stored(val entry: OAuthStateEntry, val createdAt: Instant)

    private val store = ConcurrentHashMap<String, Stored>()
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun create(
        credentialsId: UUID?,
        returnUrl: String,
        verifier: String,
    ): String {
        val nonce = encoder.encodeToString(ByteArray(24).also { random.nextBytes(it) })
        store[nonce] = Stored(OAuthStateEntry(credentialsId, returnUrl, verifier), clock.instant())
        return nonce
    }

    fun consume(state: String): OAuthStateEntry? {
        val stored = store.remove(state) ?: return null
        if (Duration.between(stored.createdAt, clock.instant()) > TTL) return null
        return stored.entry
    }

    companion object {
        private val TTL = Duration.ofMinutes(10)
    }
}
