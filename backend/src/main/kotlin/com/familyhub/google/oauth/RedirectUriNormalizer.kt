package com.familyhub.google.oauth

import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Component
import java.net.URI

@Component
class RedirectUriNormalizer {
    fun normalize(uri: String): String {
        val trimmed = uri.trim()
        if (trimmed.isEmpty()) throw ValidationException("Redirect-URI ist erforderlich")
        val parsed =
            try {
                URI(trimmed)
            } catch (ex: Exception) {
                throw ValidationException("Redirect-URI ist ungültig")
            }
        val rawScheme = parsed.scheme ?: throw ValidationException("Redirect-URI ist ungültig")
        val scheme = rawScheme.lowercase()
        val rawHost = parsed.host ?: throw ValidationException("Redirect-URI ist ungültig")
        val host = rawHost.lowercase()
        val isLocalhost = host == "localhost" || host == "127.0.0.1"
        if (scheme == "http" && !isLocalhost) {
            throw ValidationException("Redirect-URI muss https verwenden (außer localhost)")
        }
        if (scheme != "http" && scheme != "https") {
            throw ValidationException("Redirect-URI muss http oder https sein")
        }
        val port = if (parsed.port != -1) ":${parsed.port}" else ""
        // URI.getPath() is non-null for hierarchical URIs (validated above via parsed.host check)
        val path = parsed.path!!
        return "$scheme://$host$port$path"
    }
}
