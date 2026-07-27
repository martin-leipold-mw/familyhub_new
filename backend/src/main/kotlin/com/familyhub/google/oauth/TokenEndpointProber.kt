package com.familyhub.google.oauth

enum class ProbeResult { CREDENTIALS_VALID, CLIENT_INVALID, ERROR }

interface TokenEndpointProber {
    /** Ruft den Google-Token-Endpoint mit einem absichtlich ungültigen Code auf. */
    fun probe(
        clientId: String,
        clientSecret: String,
        redirectUri: String,
    ): ProbeResult
}
