package com.familyhub.google.oauth

import com.familyhub.shared.exceptions.ValidationException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class RedirectUriNormalizerTest {
    private val n = RedirectUriNormalizer()

    @Test fun `keeps a valid localhost http uri`() {
        assertThat(n.normalize("http://localhost:8080/oauth/callback"))
            .isEqualTo("http://localhost:8080/oauth/callback")
    }

    @Test fun `lowercases scheme and host, strips fragment`() {
        assertThat(n.normalize("HTTPS://FamilyHub.Example.com/oauth/callback#frag"))
            .isEqualTo("https://familyhub.example.com/oauth/callback")
    }

    @Test fun `rejects http on non-localhost host`() {
        assertThatThrownBy { n.normalize("http://familyhub.example.com/oauth/callback") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects blank`() {
        assertThatThrownBy { n.normalize("  ") }.isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects malformed uri`() {
        assertThatThrownBy { n.normalize("not a uri") }.isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects non-http(s) scheme`() {
        assertThatThrownBy { n.normalize("ftp://example.com/callback") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects missing scheme`() {
        assertThatThrownBy { n.normalize("/relative/callback") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `rejects missing host`() {
        assertThatThrownBy { n.normalize("http:///callback") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test fun `keeps a valid 127_0_0_1 http uri`() {
        assertThat(n.normalize("http://127.0.0.1:8080/callback"))
            .isEqualTo("http://127.0.0.1:8080/callback")
    }
}
