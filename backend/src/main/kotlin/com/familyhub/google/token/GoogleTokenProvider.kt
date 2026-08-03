package com.familyhub.google.token

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.GoogleOAuthFlow
import com.familyhub.shared.exceptions.GoogleConnectionRevokedException
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.google.api.client.auth.oauth2.TokenResponseException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class GoogleTokenProvider(
    private val connections: GoogleConnectionRepository,
    private val flow: GoogleOAuthFlow,
    private val credentials: CredentialsService,
    private val encryption: EncryptionService,
    private val clock: Clock,
) {
    @Transactional
    fun validAccessToken(connection: GoogleConnection): String {
        val expiresAt = connection.tokenExpiresAt
        val needsRefresh =
            expiresAt == null ||
                Instant.now(clock).plusSeconds(BUFFER_SECONDS).isAfter(expiresAt)
        if (!needsRefresh && connection.accessToken != null) {
            return encryption.decrypt(connection.accessToken!!)
        }
        val credId = connection.credentialsId
        val cred =
            if (credId != null) {
                credentials.entity(credId)
            } else {
                credentials.primaryOrNull()
                    ?: throw ResourceNotFoundException("Keine Google-Credentials konfiguriert.")
            }
        try {
            val newTokens =
                flow.refresh(
                    encryption.decrypt(cred.clientId),
                    encryption.decrypt(cred.clientSecret),
                    encryption.decrypt(connection.refreshToken),
                )
            connection.accessToken = encryption.encrypt(newTokens.accessToken)
            connection.tokenExpiresAt = Instant.now(clock).plusSeconds(newTokens.expiresInSeconds)
            if (newTokens.refreshToken != null) {
                connection.refreshToken = encryption.encrypt(newTokens.refreshToken)
            }
            connection.status = "active"
            connections.save(connection)
            return newTokens.accessToken
        } catch (ex: TokenResponseException) {
            if (ex.details?.error == "invalid_grant") {
                connection.status = "revoked"
                connections.save(connection)
                throw GoogleConnectionRevokedException()
            }
            throw ex
        }
    }

    @Transactional
    fun forceRefresh(connectionId: UUID) {
        val c =
            connections.findById(connectionId).orElseThrow {
                ResourceNotFoundException("Verbindung nicht gefunden")
            }
        c.tokenExpiresAt = Instant.EPOCH // force
        validAccessToken(c)
    }

    companion object {
        private const val BUFFER_SECONDS = 60L
    }
}
