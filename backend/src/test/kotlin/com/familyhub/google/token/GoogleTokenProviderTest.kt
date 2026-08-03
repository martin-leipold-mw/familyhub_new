package com.familyhub.google.token

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.credentials.GoogleCredentials
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.GoogleOAuthFlow
import com.familyhub.google.oauth.GoogleTokenSet
import com.familyhub.shared.exceptions.GoogleConnectionRevokedException
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.google.api.client.auth.oauth2.TokenResponseException
import io.mockk.*
import org.assertj.core.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.*
import java.util.Optional
import java.util.UUID

class GoogleTokenProviderTest {
    private val now = Instant.parse("2026-07-23T12:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)
    private val connections = mockk<GoogleConnectionRepository>()
    private val flow = mockk<GoogleOAuthFlow>()
    private val credentials = mockk<CredentialsService>()
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val provider = GoogleTokenProvider(connections, flow, credentials, enc, clock)

    private val cred =
        GoogleCredentials(
            enc.encrypt("cid"),
            enc.encrypt("sec"),
            "http://localhost:8080/oauth/callback",
            "F",
            true,
        ).also { it.id = UUID.randomUUID() }

    private fun conn(
        expiresAt: Instant?,
        accessToken: String? = enc.encrypt("OLD"),
        credentialsId: UUID? = cred.id,
    ) = GoogleConnection(
        familyMemberId = UUID.randomUUID(),
        credentialsId = credentialsId,
        googleAccountId = "g",
        email = "a@b.de",
        accessToken = accessToken,
        refreshToken = enc.encrypt("RT"),
        tokenExpiresAt = expiresAt,
    ).also { it.id = UUID.randomUUID() }

    // ─── needsRefresh: expiresAt != null and NOT isAfter → no refresh (fresh token) ─

    @Test fun `returns current token when not near expiry`() {
        val c = conn(now.plusSeconds(600))
        assertThat(provider.validAccessToken(c)).isEqualTo("OLD")
        verify(exactly = 0) { flow.refresh(any(), any(), any()) }
    }

    // ─── needsRefresh: expiresAt != null and now+60s isAfter → refresh (near expiry) ─

    @Test fun `refreshes and persists when expired`() {
        val c = conn(now.plusSeconds(30)) // within 60s buffer
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val token = provider.validAccessToken(c)
        assertThat(token).isEqualTo("NEW")
        verify { connections.save(match { enc.decrypt(it.accessToken!!) == "NEW" }) }
    }

    // ─── needsRefresh: expiresAt == null → always refresh ────────────────────

    @Test fun `refreshes when expiresAt is null`() {
        val c = conn(null)
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW2", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val token = provider.validAccessToken(c)
        assertThat(token).isEqualTo("NEW2")
        verify { flow.refresh(any(), any(), any()) }
    }

    // ─── !needsRefresh but accessToken == null → falls through to refresh ─────

    @Test fun `refreshes when token fresh but accessToken is null`() {
        // fresh expiry (600s away) but accessToken is null — must refresh
        val c = conn(now.plusSeconds(600), accessToken = null)
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW3", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        val token = provider.validAccessToken(c)
        assertThat(token).isEqualTo("NEW3")
        verify { flow.refresh(any(), any(), any()) }
    }

    // ─── cred resolution: credentialsId != null → entity() ───────────────────

    @Test fun `cred resolution uses entity() when credentialsId is present`() {
        val c = conn(now.plusSeconds(30)) // triggers refresh
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("T", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { credentials.entity(cred.id!!) }
        verify(exactly = 0) { credentials.primaryOrNull() }
    }

    // ─── cred resolution: credentialsId == null → primaryOrNull() ─────────────

    @Test fun `cred resolution falls back to primaryOrNull when credentialsId is null`() {
        val c = conn(now.plusSeconds(30), credentialsId = null) // triggers refresh, no credentialsId
        every { credentials.primaryOrNull() } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("T", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { credentials.primaryOrNull() }
        verify(exactly = 0) { credentials.entity(any()) }
    }

    // ─── cred resolution: both null → ResourceNotFoundException ───────────────

    @Test fun `throws ResourceNotFoundException when no credentials available`() {
        val c = conn(now.plusSeconds(30), credentialsId = null)
        every { credentials.primaryOrNull() } returns null

        assertThatThrownBy { provider.validAccessToken(c) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    // ─── catch TokenResponseException: invalid_grant → revoked + exception ────

    @Test fun `marks connection revoked on invalid_grant`() {
        val c = conn(now.minusSeconds(10))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } throws
            mockk<TokenResponseException>(relaxed = true) {
                every { details?.error } returns "invalid_grant"
            }
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        assertThatThrownBy { provider.validAccessToken(c) }
            .isInstanceOf(GoogleConnectionRevokedException::class.java)
        verify { connections.save(match { it.status == "revoked" }) }
    }

    // ─── catch TokenResponseException: other error → rethrow ─────────────────

    @Test fun `rethrows TokenResponseException for non-invalid_grant errors`() {
        val c = conn(now.minusSeconds(10))
        every { credentials.entity(cred.id!!) } returns cred
        val ex =
            mockk<TokenResponseException>(relaxed = true) {
                every { details?.error } returns "temporarily_unavailable"
            }
        every { flow.refresh(any(), any(), any()) } throws ex

        assertThatThrownBy { provider.validAccessToken(c) }
            .isSameAs(ex)
        // should NOT save revoked status
        verify(exactly = 0) { connections.save(any()) }
    }

    // ─── catch TokenResponseException: details==null → rethrow (details-null branch) ─

    @Test fun `rethrows TokenResponseException when details is null`() {
        // Exercises the missed branch: ex.details == null →
        // ex.details?.error evaluates to null → null != "invalid_grant" → rethrow
        val c = conn(now.minusSeconds(10))
        every { credentials.entity(cred.id!!) } returns cred
        val ex = mockk<TokenResponseException>(relaxed = true)
        every { ex.details } returns null
        every { flow.refresh(any(), any(), any()) } throws ex

        assertThatThrownBy { provider.validAccessToken(c) }
            .isSameAs(ex)
        verify(exactly = 0) { connections.save(any()) }
    }

    // ─── forceRefresh: found → sets EPOCH + triggers refresh ─────────────────

    @Test fun `forceRefresh resets expiry to EPOCH and triggers token refresh`() {
        val connId = UUID.randomUUID()
        val c = conn(now.plusSeconds(600)) // would NOT normally need refresh
        c.id = connId
        every { connections.findById(connId) } returns Optional.of(c)
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("FORCED", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.forceRefresh(connId)

        verify { flow.refresh(any(), any(), any()) }
        verify { connections.save(match { enc.decrypt(it.accessToken!!) == "FORCED" }) }
    }

    // ─── forceRefresh: not found → ResourceNotFoundException ──────────────────

    @Test fun `forceRefresh throws ResourceNotFoundException when connection not found`() {
        val unknownId = UUID.randomUUID()
        every { connections.findById(unknownId) } returns Optional.empty()

        assertThatThrownBy { provider.forceRefresh(unknownId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    // ─── persists new expiresAt and status after successful refresh ────────────

    @Test fun `sets status to active and persists expiresAt after successful refresh`() {
        val c = conn(now.minusSeconds(100))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify {
            connections.save(
                match {
                    it.status == "active" && it.tokenExpiresAt == now.plusSeconds(3600)
                },
            )
        }
    }

    // ─── refresh-token rotation: Google returns a new refresh token → persist it ─

    @Test fun `persists rotated refresh token when refresh returns a new one`() {
        val c = conn(now.minusSeconds(100))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", "ROTATED", 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "ROTATED" }) }
    }

    // ─── refresh-token rotation: Google returns null → keep the existing token ─

    @Test fun `keeps existing refresh token when refresh returns null`() {
        val c = conn(now.minusSeconds(100))
        every { credentials.entity(cred.id!!) } returns cred
        every { flow.refresh(any(), any(), any()) } returns GoogleTokenSet("NEW", null, 3600, null)
        every { connections.save(any<GoogleConnection>()) } answers { firstArg() }

        provider.validAccessToken(c)
        verify { connections.save(match { enc.decrypt(it.refreshToken) == "RT" }) }
    }
}
