package com.familyhub.google.oauth

import com.google.api.client.auth.oauth2.*
import com.google.api.client.http.*
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.util.UriComponentsBuilder

data class GoogleTokenSet(val accessToken: String, val refreshToken: String?, val expiresInSeconds: Long, val scope: String?)
data class GoogleUserInfo(val sub: String, val email: String, val name: String?, val picture: String?)

@Component
class GoogleOAuthFlow(
    private val pkce: PkceGenerator,
    @Value("\${google.token-url:https://oauth2.googleapis.com/token}") private val tokenUrl: String,
    @Value("\${google.userinfo-url:https://www.googleapis.com/oauth2/v2/userinfo}") private val userInfoUrl: String,
    @Value("\${google.revoke-url:https://oauth2.googleapis.com/revoke}") private val revokeUrl: String,
    @Value("\${google.authorize-url:https://accounts.google.com/o/oauth2/v2/auth}") private val authorizeUrl: String,
) : TokenEndpointProber {
    private val transport = NetHttpTransport()
    private val json = GsonFactory.getDefaultInstance()
    private val scopes = listOf(
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
    )

    fun buildAuthorizationUrl(clientId: String, redirectUri: String, state: String, codeChallenge: String): String =
        UriComponentsBuilder.fromUriString(authorizeUrl)
            .queryParam("client_id", clientId)
            .queryParam("redirect_uri", redirectUri)
            .queryParam("response_type", "code")
            .queryParam("scope", scopes.joinToString(" "))
            .queryParam("access_type", "offline")
            .queryParam("prompt", "consent")
            .queryParam("code_challenge", codeChallenge)
            .queryParam("code_challenge_method", "S256")
            .queryParam("state", state)
            .build().encode().toUriString()

    fun exchangeCode(clientId: String, clientSecret: String, redirectUri: String, code: String, verifier: String): GoogleTokenSet {
        val req = AuthorizationCodeTokenRequest(transport, json, GenericUrl(tokenUrl), code)
            .setRedirectUri(redirectUri)
            .setClientAuthentication(ClientParametersAuthentication(clientId, clientSecret))
        req.set("code_verifier", verifier)
        val resp = req.execute()
        return GoogleTokenSet(resp.accessToken, resp.refreshToken, resp.expiresInSeconds, resp.scope)
    }

    fun refresh(clientId: String, clientSecret: String, refreshToken: String): GoogleTokenSet {
        val resp = RefreshTokenRequest(transport, json, GenericUrl(tokenUrl), refreshToken)
            .setClientAuthentication(ClientParametersAuthentication(clientId, clientSecret))
            .execute()
        return GoogleTokenSet(resp.accessToken, resp.refreshToken, resp.expiresInSeconds, resp.scope)
    }

    fun fetchUserInfo(accessToken: String): GoogleUserInfo {
        val request = transport.createRequestFactory().buildGetRequest(GenericUrl(userInfoUrl))
        request.headers.authorization = "Bearer $accessToken"
        val body = request.execute().parseAsString()
        val map = json.createJsonParser(body).parse(Map::class.java)
        return GoogleUserInfo(
            sub = map["id"]?.toString() ?: map["sub"].toString(),
            email = map["email"].toString(),
            name = map["name"]?.toString(),
            picture = map["picture"]?.toString(),
        )
    }

    fun revoke(token: String) {
        try {
            transport.createRequestFactory()
                .buildPostRequest(GenericUrl("$revokeUrl?token=$token"), null).execute()
        } catch (ex: Exception) { /* best-effort: local disconnect proceeds regardless */ }
    }

    override fun probe(clientId: String, clientSecret: String, redirectUri: String): ProbeResult {
        return try {
            exchangeCode(clientId, clientSecret, redirectUri, "invalid-probe-code", pkce.generateVerifier())
            ProbeResult.CREDENTIALS_VALID // unexpected success also means creds are fine
        } catch (ex: TokenResponseException) {
            when (ex.details?.error) {
                "invalid_grant" -> ProbeResult.CREDENTIALS_VALID
                "invalid_client" -> ProbeResult.CLIENT_INVALID
                else -> ProbeResult.ERROR
            }
        } catch (ex: Exception) { ProbeResult.ERROR }
    }
}
