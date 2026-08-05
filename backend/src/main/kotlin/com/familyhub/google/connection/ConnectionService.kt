package com.familyhub.google.connection

import com.familyhub.google.credentials.CredentialsService
import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.GoogleOAuthFlow
import com.familyhub.google.oauth.OAuthStateStore
import com.familyhub.google.oauth.PkceGenerator
import com.familyhub.google.token.GoogleTokenProvider
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.settings.SettingsService
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

data class CallbackResult(val memberId: UUID, val memberName: String, val isNewMember: Boolean, val returnUrl: String)

data class ConnectionView(
    val connectionId: UUID,
    val memberId: UUID,
    val email: String,
    val name: String,
    val status: String,
    val lastSyncedAt: Instant?,
    val scopes: List<String>,
)

@Service
class ConnectionService(
    private val credentials: CredentialsService,
    private val flow: GoogleOAuthFlow,
    private val stateStore: OAuthStateStore,
    private val pkce: PkceGenerator,
    private val connections: GoogleConnectionRepository,
    private val members: FamilyMemberRepository,
    private val encryption: EncryptionService,
    private val settings: SettingsService,
    private val tokenProvider: GoogleTokenProvider,
) {
    private val palette = listOf("blue", "pink", "green", "purple", "orange", "teal")

    fun startAuthorization(
        credentialsId: UUID?,
        returnUrl: String,
        memberId: UUID? = null,
    ): String {
        val cred =
            if (credentialsId != null) {
                credentials.entity(credentialsId)
            } else {
                credentials.primaryOrNull()
                    ?: throw ResourceNotFoundException("Keine Google-Credentials konfiguriert. Bitte zuerst im Setup einrichten.")
            }
        val clientId = encryption.decrypt(cred.clientId)
        val verifier = pkce.generateVerifier()
        val safeReturn = sanitizeReturnUrl(returnUrl)
        val state = stateStore.create(cred.id, safeReturn, verifier, memberId)
        return flow.buildAuthorizationUrl(clientId, cred.redirectUri, state, pkce.challengeFor(verifier))
    }

    @Transactional
    fun handleCallback(
        code: String,
        state: String,
    ): CallbackResult {
        val entry =
            stateStore.consume(state)
                ?: throw ValidationException("Ungültiger oder abgelaufener Anmeldevorgang.")
        val entryCredId = entry.credentialsId
        val cred =
            if (entryCredId != null) {
                credentials.entity(entryCredId)
            } else {
                credentials.primaryOrNull()
                    ?: throw ValidationException("Keine Google-Credentials konfiguriert.")
            }
        val tokens =
            flow.exchangeCode(
                encryption.decrypt(cred.clientId),
                encryption.decrypt(cred.clientSecret),
                cred.redirectUri,
                code,
                entry.verifier,
            )
        val userInfo = flow.fetchUserInfo(tokens.accessToken)

        val existing = connections.findByGoogleAccountId(userInfo.sub)
        val refresh = tokens.refreshToken
        val member: FamilyMember
        val isNew: Boolean
        if (existing == null) {
            if (refresh == null) {
                throw ValidationException(
                    "Google hat kein Refresh-Token geliefert. Bitte den Zugriff in den " +
                        "Google-Kontoeinstellungen entfernen und erneut verbinden.",
                )
            }
            val chosenMemberId = entry.memberId
            if (chosenMemberId != null) {
                member =
                    members.findById(chosenMemberId).orElseThrow {
                        ResourceNotFoundException("Mitglied nicht gefunden")
                    }
                // 1 member ↔ 1 Google account: replace any prior connection on this member.
                connections.findByFamilyMemberId(chosenMemberId)?.let { connections.delete(it) }
                isNew = false
            } else {
                member =
                    members.save(
                        FamilyMember(
                            name = userInfo.name ?: userInfo.email, role = "parent",
                            color = palette[(members.count() % palette.size).toInt()],
                        ),
                    )
                isNew = true
            }
            connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!, credentialsId = cred.id, googleAccountId = userInfo.sub,
                    email = userInfo.email, accessToken = encryption.encrypt(tokens.accessToken),
                    refreshToken = encryption.encrypt(refresh),
                    tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds),
                    scopes = if (tokens.scope != null) tokens.scope.split(" ") else emptyList(), status = "active",
                ),
            )
        } else {
            // Known Google account: update tokens, and rehang to the chosen member if one was picked.
            val targetMemberId = entry.memberId ?: existing.familyMemberId
            if (entry.memberId != null && entry.memberId != existing.familyMemberId) {
                connections.findByFamilyMemberId(entry.memberId)?.let {
                    if (it.id != existing.id) connections.delete(it)
                }
            }
            member =
                members.findById(targetMemberId).orElseThrow {
                    ResourceNotFoundException("Mitglied nicht gefunden")
                }
            existing.familyMemberId = targetMemberId
            existing.accessToken = encryption.encrypt(tokens.accessToken)
            existing.tokenExpiresAt = Instant.now().plusSeconds(tokens.expiresInSeconds)
            existing.status = "active"
            existing.credentialsId = cred.id
            if (refresh != null) existing.refreshToken = encryption.encrypt(refresh)
            tokens.scope?.let { existing.scopes = it.split(" ") }
            connections.save(existing)
            isNew = false
        }
        settings.setGoogleConnected(true)
        return CallbackResult(member.id!!, member.name, isNew, entry.returnUrl)
    }

    fun listConnections(): List<ConnectionView> =
        connections.findAll().map { c ->
            val name = members.findById(c.familyMemberId).map { it.name }.orElse(c.email)
            ConnectionView(c.id!!, c.familyMemberId, c.email, name, c.status, c.lastSyncedAt, c.scopes)
        }

    @Transactional
    fun disconnect(connectionId: UUID) {
        val c =
            connections.findById(connectionId).orElseThrow {
                ResourceNotFoundException("Verbindung nicht gefunden")
            }
        runCatching { flow.revoke(encryption.decrypt(c.refreshToken)) }
        connections.delete(c)
        if (connections.count() == 0L) settings.setGoogleConnected(false)
    }

    fun refreshConnection(connectionId: UUID) = tokenProvider.forceRefresh(connectionId)

    private fun sanitizeReturnUrl(url: String): String {
        val t = url.trim()
        return if (t.isEmpty() || !t.startsWith("/") || t.startsWith("//") || t.contains("://")) "/" else t
    }
}
