package com.familyhub.google.oauth

import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Component
import java.net.URI

@Component
class RedirectUriNormalizer {
    fun normalize(uri: String): String {
        val trimmed = uri.trim()
        if (trimmed.isEmpty()) throw ValidationException("Redirect-URI ist erforderlich")
        val parsed = try {
            URI(trimmed)
        } catch (ex: Exception) {
            throw ValidationException("Redirect-URI ist ungültig")
        }
        val scheme = parsed.scheme?.lowercase()
            ?: throw ValidationException("Redirect-URI ist ungültig")
        val host = parsed.host?.lowercase()
            ?: throw ValidationException("Redirect-URI ist ungültig")
        val isLocalhost = host == "localhost" || host == "127.0.0.1"
        if (scheme == "http" && !isLocalhost) {
            throw ValidationException("Redirect-URI muss https verwenden (außer localhost)")
        }
        if (scheme != "http" && scheme != "https") {
            throw ValidationException("Redirect-URI muss http oder https sein")
        }
        val port = if (parsed.port != -1) ":${parsed.port}" else ""
        val path = parsed.path ?: ""
        return "$scheme://$host$port$path"
    }
}
