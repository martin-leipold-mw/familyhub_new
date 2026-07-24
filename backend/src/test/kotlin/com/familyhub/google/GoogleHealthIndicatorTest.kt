package com.familyhub.google

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.actuate.health.Status
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class GoogleHealthIndicatorTest {

    private val repo = mockk<GoogleConnectionRepository>()
    private val fixedNow = Instant.parse("2026-07-24T12:00:00Z")
    private val clock = Clock.fixed(fixedNow, ZoneOffset.UTC)
    private val indicator = GoogleHealthIndicator(repo, clock)

    private fun makeConnection(
        status: String,
        lastSyncedAt: Instant? = null,
    ) = GoogleConnection(
        familyMemberId = UUID.randomUUID(),
        credentialsId = null,
        googleAccountId = "g-${UUID.randomUUID()}",
        email = "test@example.com",
        accessToken = null,
        refreshToken = "encrypted-rt",
        tokenExpiresAt = null,
        scopes = emptyList(),
        status = status,
        lastSyncedAt = lastSyncedAt,
    )

    @Test
    fun `no connections returns UNKNOWN with activeConnections=0 and revokedConnections=0`() {
        every { repo.findAllByStatus("active") } returns emptyList()
        every { repo.findAllByStatus("revoked") } returns emptyList()

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UNKNOWN)
        assertThat(health.details["activeConnections"]).isEqualTo(0)
        assertThat(health.details["revokedConnections"]).isEqualTo(0)
        assertThat(health.details).doesNotContainKey("lastSyncAgeMinutes")
    }

    @Test
    fun `one active with lastSyncedAt and one revoked returns UP with correct details`() {
        val syncTime = Instant.parse("2026-07-24T11:45:00Z") // 15 minutes before fixedNow
        val active = makeConnection("active", lastSyncedAt = syncTime)
        val revoked = makeConnection("revoked")

        every { repo.findAllByStatus("active") } returns listOf(active)
        every { repo.findAllByStatus("revoked") } returns listOf(revoked)

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details["activeConnections"]).isEqualTo(1)
        assertThat(health.details["revokedConnections"]).isEqualTo(1)
        assertThat(health.details["lastSyncAgeMinutes"]).isEqualTo(15L)
    }

    @Test
    fun `active connections with no lastSyncedAt omits lastSyncAgeMinutes`() {
        val active = makeConnection("active", lastSyncedAt = null)

        every { repo.findAllByStatus("active") } returns listOf(active)
        every { repo.findAllByStatus("revoked") } returns emptyList()

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details["activeConnections"]).isEqualTo(1)
        assertThat(health.details["revokedConnections"]).isEqualTo(0)
        assertThat(health.details).doesNotContainKey("lastSyncAgeMinutes")
    }

    @Test
    fun `multiple active connections uses the most recent lastSyncedAt`() {
        val olderSync = Instant.parse("2026-07-24T11:30:00Z") // 30 minutes before fixedNow
        val newerSync = Instant.parse("2026-07-24T11:50:00Z") // 10 minutes before fixedNow
        val active1 = makeConnection("active", lastSyncedAt = olderSync)
        val active2 = makeConnection("active", lastSyncedAt = newerSync)

        every { repo.findAllByStatus("active") } returns listOf(active1, active2)
        every { repo.findAllByStatus("revoked") } returns emptyList()

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details["activeConnections"]).isEqualTo(2)
        assertThat(health.details["lastSyncAgeMinutes"]).isEqualTo(10L)
    }

    @Test
    fun `active empty but revoked non-empty returns UP with activeConnections=0`() {
        // Exercises the missed branch: active.isEmpty()=true && revoked.isEmpty()=false → condition false
        // The && short-circuit means: left=true, right=false → overall false → falls through to Health.up()
        val revoked = makeConnection("revoked")

        every { repo.findAllByStatus("active") } returns emptyList()
        every { repo.findAllByStatus("revoked") } returns listOf(revoked)

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details["activeConnections"]).isEqualTo(0)
        assertThat(health.details["revokedConnections"]).isEqualTo(1)
        assertThat(health.details).doesNotContainKey("lastSyncAgeMinutes")
    }
}
