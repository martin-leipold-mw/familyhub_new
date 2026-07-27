package com.familyhub.google.oauth

import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

@Component
class PkceGenerator {
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun generateVerifier(): String = encoder.encodeToString(ByteArray(48).also { random.nextBytes(it) }) // 64 chars

    fun challengeFor(verifier: String): String = encoder.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
}
