package com.familyhub.google

import com.familyhub.google.connection.GoogleConnectionRepository
import org.springframework.boot.actuate.health.Health
import org.springframework.boot.actuate.health.HealthIndicator
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.time.Instant

@Component
class GoogleHealthIndicator(
    private val connectionRepository: GoogleConnectionRepository,
    private val clock: Clock,
) : HealthIndicator {
    override fun health(): Health {
        val active = connectionRepository.findAllByStatus("active")
        val revoked = connectionRepository.findAllByStatus("revoked")

        if (active.isEmpty() && revoked.isEmpty()) {
            return Health.unknown()
                .withDetail("activeConnections", 0)
                .withDetail("revokedConnections", 0)
                .build()
        }

        val builder =
            Health.up()
                .withDetail("activeConnections", active.size)
                .withDetail("revokedConnections", revoked.size)

        val maxLastSync: Instant? = active.mapNotNull { it.lastSyncedAt }.maxOrNull()
        if (maxLastSync != null) {
            builder.withDetail(
                "lastSyncAgeMinutes",
                Duration.between(maxLastSync, Instant.now(clock)).toMinutes(),
            )
        }

        return builder.build()
    }
}
