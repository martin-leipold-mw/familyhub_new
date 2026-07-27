package com.familyhub.google.crypto

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class EncryptionServiceTest {
    private val service = EncryptionService("test-key-with-more-than-32-characters-in-it")

    @Test
    fun `round-trips a plaintext`() {
        val cipher = service.encrypt("hello-token")
        assertThat(cipher).isNotEqualTo("hello-token")
        assertThat(service.decrypt(cipher)).isEqualTo("hello-token")
    }

    @Test
    fun `produces a different ciphertext each call (random IV)`() {
        assertThat(service.encrypt("x")).isNotEqualTo(service.encrypt("x"))
    }

    @Test
    fun `derives a valid key from a short non-ASCII key string`() {
        val s = EncryptionService("schlüssel-äöü")
        assertThat(s.decrypt(s.encrypt("payload"))).isEqualTo("payload")
    }

    @Test
    fun `rejects tampered ciphertext`() {
        val cipher = service.encrypt("secret")
        val tampered = cipher.dropLast(4) + "AAAA"
        assertThatThrownBy { service.decrypt(tampered) }.isInstanceOf(Exception::class.java)
    }
}
