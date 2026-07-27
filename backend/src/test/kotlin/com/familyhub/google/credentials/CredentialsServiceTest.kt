package com.familyhub.google.credentials

import com.familyhub.google.crypto.EncryptionService
import com.familyhub.google.oauth.ProbeResult
import com.familyhub.google.oauth.RedirectUriNormalizer
import com.familyhub.google.oauth.TokenEndpointProber
import com.familyhub.shared.exceptions.ResourceNotFoundException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class CredentialsServiceTest {
    private val repo = mockk<GoogleCredentialsRepository>(relaxed = true)
    private val enc = EncryptionService("test-key-with-more-than-32-characters-in-it")
    private val normalizer = RedirectUriNormalizer()
    private val prober = mockk<TokenEndpointProber>()
    private lateinit var service: CredentialsService

    @BeforeEach fun setup() {
        service = CredentialsService(repo, enc, normalizer, prober)
    }

    @Test fun `create encrypts secrets and never returns them`() {
        val saved = slot<GoogleCredentials>()
        every { repo.findByIsPrimaryTrue() } returns null
        every { repo.save(capture(saved)) } answers { saved.captured.also { it.id = UUID.randomUUID() } }
        val view = service.create(newRequest())
        assertThat(saved.captured.clientId).isNotEqualTo("cid.apps.googleusercontent.com")
        assertThat(enc.decrypt(saved.captured.clientId)).isEqualTo("cid.apps.googleusercontent.com")
        // View exposes no secret
        assertThat(view.nickname).isEqualTo("Familie")
    }

    @Test fun `create sets isPrimary=false when a primary already exists`() {
        val saved = slot<GoogleCredentials>()
        every { repo.findByIsPrimaryTrue() } returns existing(isPrimary = true)
        every { repo.save(capture(saved)) } answers { saved.captured.also { it.id = UUID.randomUUID() } }
        service.create(newRequest())
        assertThat(saved.captured.isPrimary).isFalse()
    }

    @Test fun `setPrimary demotes the previous primary`() {
        val old = existing(isPrimary = true)
        val target = existing(isPrimary = false)
        every { repo.findByIsPrimaryTrue() } returns old
        every { repo.findById(target.id!!) } returns Optional.of(target)
        every { repo.save(any()) } answers { firstArg() }
        service.setPrimary(target.id!!)
        assertThat(old.isPrimary).isFalse()
        assertThat(target.isPrimary).isTrue()
    }

    @Test fun `setPrimary works when no previous primary exists`() {
        val target = existing(isPrimary = false)
        every { repo.findByIsPrimaryTrue() } returns null
        every { repo.findById(target.id!!) } returns Optional.of(target)
        every { repo.save(any()) } answers { firstArg() }
        service.setPrimary(target.id!!)
        assertThat(target.isPrimary).isTrue()
    }

    @Test fun `setPrimary is idempotent when target is already primary`() {
        val target = existing(isPrimary = true)
        every { repo.findByIsPrimaryTrue() } returns target // same entity
        every { repo.findById(target.id!!) } returns Optional.of(target)
        every { repo.save(any()) } answers { firstArg() }
        service.setPrimary(target.id!!)
        assertThat(target.isPrimary).isTrue() // still primary, no demotion
    }

    @Test fun `get throws when missing`() {
        every { repo.findById(any()) } returns Optional.empty()
        assertThatThrownBy { service.get(UUID.randomUUID()) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test fun `validate maps invalid_grant to success`() {
        every { prober.probe(any(), any(), any()) } returns ProbeResult.CREDENTIALS_VALID
        val r = service.validate("cid.apps.googleusercontent.com", "sec", "http://localhost:8080/oauth/callback")
        assertThat(r.isValid).isTrue()
    }

    @Test fun `validate maps invalid_client to failure`() {
        every { prober.probe(any(), any(), any()) } returns ProbeResult.CLIENT_INVALID
        val r = service.validate("cid.apps.googleusercontent.com", "sec", "http://localhost:8080/oauth/callback")
        assertThat(r.isValid).isFalse()
    }

    @Test fun `validate maps ERROR to failure`() {
        every { prober.probe(any(), any(), any()) } returns ProbeResult.ERROR
        val r = service.validate("cid.apps.googleusercontent.com", "sec", "http://localhost:8080/oauth/callback")
        assertThat(r.isValid).isFalse()
        assertThat(r.message).contains("fehlgeschlagen")
    }

    @Test fun `update re-encrypts clientId and clientSecret when provided`() {
        val e = existing(isPrimary = false)
        every { repo.findById(e.id!!) } returns Optional.of(e)
        every { repo.save(any()) } answers { firstArg() }
        val cmd =
            CredentialsCommand(
                nickname = "Neu",
                clientId = "newcid.apps.googleusercontent.com",
                clientSecret = "newSecret",
                redirectUri = "http://localhost:8080/oauth/callback",
            )
        service.update(e.id!!, cmd)
        assertThat(enc.decrypt(e.clientId)).isEqualTo("newcid.apps.googleusercontent.com")
        assertThat(enc.decrypt(e.clientSecret)).isEqualTo("newSecret")
    }

    @Test fun `update skips re-encryption when clientId and clientSecret are blank`() {
        val e = existing(isPrimary = false)
        val originalClientId = e.clientId
        val originalClientSecret = e.clientSecret
        every { repo.findById(e.id!!) } returns Optional.of(e)
        every { repo.save(any()) } answers { firstArg() }
        val cmd =
            CredentialsCommand(
                nickname = "Neu",
                clientId = "",
                clientSecret = "",
                redirectUri = "http://localhost:8080/oauth/callback",
            )
        service.update(e.id!!, cmd)
        assertThat(e.clientId).isEqualTo(originalClientId)
        assertThat(e.clientSecret).isEqualTo(originalClientSecret)
    }

    @Test fun `update re-encrypts only clientId when clientSecret is blank`() {
        val e = existing(isPrimary = false)
        val originalClientSecret = e.clientSecret
        every { repo.findById(e.id!!) } returns Optional.of(e)
        every { repo.save(any()) } answers { firstArg() }
        val cmd =
            CredentialsCommand(
                nickname = "Neu",
                clientId = "onlycid.apps.googleusercontent.com",
                clientSecret = "",
                redirectUri = "http://localhost:8080/oauth/callback",
            )
        service.update(e.id!!, cmd)
        assertThat(enc.decrypt(e.clientId)).isEqualTo("onlycid.apps.googleusercontent.com")
        assertThat(e.clientSecret).isEqualTo(originalClientSecret)
    }

    @Test fun `update re-encrypts only clientSecret when clientId is blank`() {
        val e = existing(isPrimary = false)
        val originalClientId = e.clientId
        every { repo.findById(e.id!!) } returns Optional.of(e)
        every { repo.save(any()) } answers { firstArg() }
        val cmd =
            CredentialsCommand(
                nickname = "Neu",
                clientId = "",
                clientSecret = "onlysecret",
                redirectUri = "http://localhost:8080/oauth/callback",
            )
        service.update(e.id!!, cmd)
        assertThat(e.clientId).isEqualTo(originalClientId)
        assertThat(enc.decrypt(e.clientSecret)).isEqualTo("onlysecret")
    }

    private fun newRequest() =
        CredentialsCommand(
            nickname = "Familie",
            clientId = "cid.apps.googleusercontent.com",
            clientSecret = "GOCSPX-secret",
            redirectUri = "http://localhost:8080/oauth/callback",
        )

    private fun existing(isPrimary: Boolean) =
        GoogleCredentials(
            clientId = enc.encrypt("cid"),
            clientSecret = enc.encrypt("sec"),
            redirectUri = "http://localhost:8080/oauth/callback",
            nickname = "N",
            isPrimary = isPrimary,
        ).also { it.id = UUID.randomUUID() }
}
