package com.familyhub.shared.config

import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class StartupValidator(
    @Value("\${familyhub.security.encryption-key:}") private val encryptionKey: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @PostConstruct
    fun validate() {
        if (encryptionKey.isBlank()) {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY must be set. " +
                    "Starting with an empty encryption key is not allowed.",
            )
        }
        if (encryptionKey.contains("CHANGE_ME", ignoreCase = true)) {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY appears to be the example placeholder. " +
                    "Generate a secure 32+ character key: openssl rand -base64 32",
            )
        }
        if (encryptionKey.length < 32) {
            throw IllegalStateException(
                "FAMILYHUB_ENCRYPTION_KEY must be at least 32 characters. " +
                    "Current length: ${encryptionKey.length}",
            )
        }
        log.info("Startup validation passed: encryption key configured correctly")
    }
}
