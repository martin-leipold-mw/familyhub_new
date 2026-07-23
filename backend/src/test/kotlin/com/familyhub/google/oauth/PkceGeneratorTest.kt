package com.familyhub.google.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import java.util.Base64

class PkceGeneratorTest {
    private val g = PkceGenerator()

    @Test fun `verifier has valid length and charset`() {
        val v = g.generateVerifier()
        assertThat(v.length).isBetween(43, 128)
        assertThat(v).matches("[A-Za-z0-9_-]+")
    }

    @Test fun `challenge is base64url sha256 of verifier without padding`() {
        val v = "test-verifier-value"
        val expected = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(v.toByteArray()))
        assertThat(g.challengeFor(v)).isEqualTo(expected)
    }
}
