package com.familyhub.pin

import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@Service
class PinSessionService(private val clock: Clock) {

    private val sessions = ConcurrentHashMap<UUID, Instant>()

    fun createSession(): UUID {
        val token = UUID.randomUUID()
        sessions[token] = Instant.now(clock)
        return token
    }

    fun isValid(token: UUID): Boolean {
        val lastAccessed = sessions[token] ?: return false
        if (Duration.between(lastAccessed, Instant.now(clock)) >= TIMEOUT) {
            sessions.remove(token)
            return false
        }
        sessions[token] = Instant.now(clock)
        return true
    }

    companion object {
        val TIMEOUT: Duration = Duration.ofMinutes(15)
    }
}
