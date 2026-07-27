package com.familyhub.google.credentials

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.ProbeResult
import com.familyhub.google.oauth.RedirectUriNormalizer
import com.familyhub.google.oauth.TokenEndpointProber
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

data class CredentialsCommand(
    val nickname: String,
    val clientId: String,
    val clientSecret: String,
    val redirectUri: String,
)

data class GoogleCredentialsView(
    val id: UUID,
    val nickname: String,
    val redirectUri: String,
    val isPrimary: Boolean,
    val isActive: Boolean,
    val createdAt: Instant?,
)

data class ValidationResult(val isValid: Boolean, val message: String)

@Service
class CredentialsService(
    private val repo: GoogleCredentialsRepository,
    private val encryption: EncryptionService,
    private val normalizer: RedirectUriNormalizer,
    private val prober: TokenEndpointProber,
) {
    @Transactional
    fun create(cmd: CredentialsCommand): GoogleCredentialsView {
        val entity =
            GoogleCredentials(
                clientId = encryption.encrypt(cmd.clientId.trim()),
                clientSecret = encryption.encrypt(cmd.clientSecret.trim()),
                redirectUri = normalizer.normalize(cmd.redirectUri),
                nickname = cmd.nickname.trim(),
                // first one becomes primary
                isPrimary = repo.findByIsPrimaryTrue() == null,
            )
        return repo.save(entity).toView()
    }

    fun list(): List<GoogleCredentialsView> = repo.findAll().map { it.toView() }

    fun get(id: UUID): GoogleCredentialsView = load(id).toView()

    @Transactional
    fun update(
        id: UUID,
        cmd: CredentialsCommand,
    ): GoogleCredentialsView {
        val e = load(id)
        e.nickname = cmd.nickname.trim()
        e.redirectUri = normalizer.normalize(cmd.redirectUri)
        if (cmd.clientId.isNotBlank()) e.clientId = encryption.encrypt(cmd.clientId.trim())
        if (cmd.clientSecret.isNotBlank()) e.clientSecret = encryption.encrypt(cmd.clientSecret.trim())
        return repo.save(e).toView()
    }

    @Transactional
    fun delete(id: UUID) = repo.delete(load(id))

    @Transactional
    fun setPrimary(id: UUID): GoogleCredentialsView {
        val target = load(id)
        repo.findByIsPrimaryTrue()?.let {
            if (it.id != target.id) {
                it.isPrimary = false
                repo.save(it)
            }
        }
        target.isPrimary = true
        return repo.save(target).toView()
    }

    fun validate(
        clientId: String,
        clientSecret: String,
        redirectUri: String,
    ): ValidationResult =
        when (prober.probe(clientId.trim(), clientSecret.trim(), normalizer.normalize(redirectUri))) {
            ProbeResult.CREDENTIALS_VALID -> ValidationResult(true, "Verbindung erfolgreich!")
            ProbeResult.CLIENT_INVALID -> ValidationResult(false, "Client-ID oder Secret ist ungültig.")
            ProbeResult.ERROR -> ValidationResult(false, "Verbindung zu Google fehlgeschlagen.")
        }

    // Internal — for the OAuth flow only
    fun decryptedClientId(id: UUID): String = encryption.decrypt(load(id).clientId)

    fun entity(id: UUID): GoogleCredentials = load(id)

    fun primaryOrNull(): GoogleCredentials? = repo.findByIsPrimaryTrue()

    private fun load(id: UUID): GoogleCredentials =
        repo.findById(id).orElseThrow { ResourceNotFoundException("Google-Credentials nicht gefunden") }

    private fun GoogleCredentials.toView() = GoogleCredentialsView(id!!, nickname, redirectUri, isPrimary, isActive, createdAt)
}
