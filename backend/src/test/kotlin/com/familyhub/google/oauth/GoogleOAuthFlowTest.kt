package com.familyhub.google.oauth

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.*
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*

class GoogleOAuthFlowTest {
    private lateinit var wm: WireMockServer
    private lateinit var flow: GoogleOAuthFlow

    @BeforeEach fun start() {
        wm = WireMockServer(options().dynamicPort()); wm.start()
        flow = GoogleOAuthFlow(
            PkceGenerator(),
            tokenUrl = "${wm.baseUrl()}/token",
            userInfoUrl = "${wm.baseUrl()}/userinfo",
            revokeUrl = "${wm.baseUrl()}/revoke",
            authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth",
        )
    }
    @AfterEach fun stop() = wm.stop()

    // ── Brief's 5 tests ──────────────────────────────────────────────────────

    @Test fun `authorization url carries pkce and offline params`() {
        val url = flow.buildAuthorizationUrl("cid", "http://localhost:8080/oauth/callback", "state123", "challengeXYZ")
        assertThat(url).contains("code_challenge=challengeXYZ", "code_challenge_method=S256",
            "access_type=offline", "prompt=consent", "state=state123", "client_id=cid")
    }

    @Test fun `exchangeCode parses tokens`() {
        wm.stubFor(post("/token").willReturn(okJson(
            """{"access_token":"AT","refresh_token":"RT","expires_in":3600,"token_type":"Bearer","scope":"a b"}""")))
        val set = flow.exchangeCode("cid", "sec", "http://localhost:8080/oauth/callback", "code", "verifier")
        assertThat(set.accessToken).isEqualTo("AT")
        assertThat(set.refreshToken).isEqualTo("RT")
        assertThat(set.expiresInSeconds).isEqualTo(3600)
    }

    @Test fun `probe maps invalid_grant to CREDENTIALS_VALID`() {
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(400)
            .withHeader("Content-Type","application/json; charset=UTF-8").withBody("""{"error":"invalid_grant"}""")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.CREDENTIALS_VALID)
    }

    @Test fun `probe maps invalid_client to CLIENT_INVALID`() {
        // Google returns HTTP 401 for invalid_client. The Google HTTP client consumes the
        // body on 401 (leaving ex.details null), so probe() branches on statusCode == 401.
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(401)
            .withHeader("Content-Type","application/json").withBody("""{"error":"invalid_client"}""")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.CLIENT_INVALID)
    }

    @Test fun `fetchUserInfo parses profile`() {
        wm.stubFor(get("/userinfo").willReturn(okJson(
            """{"sub":"123","email":"a@b.de","name":"Papa","picture":"http://p"}""")))
        val u = flow.fetchUserInfo("AT")
        assertThat(u.sub).isEqualTo("123"); assertThat(u.email).isEqualTo("a@b.de")
    }

    // ── Extra coverage tests ──────────────────────────────────────────────────

    @Test fun `refresh returns new token set`() {
        wm.stubFor(post("/token").willReturn(okJson(
            """{"access_token":"NEWAT","refresh_token":"NEWRT","expires_in":7200,"token_type":"Bearer","scope":"a b"}""")))
        val set = flow.refresh("cid", "sec", "oldRT")
        assertThat(set.accessToken).isEqualTo("NEWAT")
        assertThat(set.refreshToken).isEqualTo("NEWRT")
        assertThat(set.expiresInSeconds).isEqualTo(7200)
        assertThat(set.scope).isEqualTo("a b")
    }

    @Test fun `revoke succeeds on 200`() {
        wm.stubFor(post("/revoke").willReturn(aResponse().withStatus(200)))
        // should not throw
        flow.revoke("someToken")
    }

    @Test fun `revoke swallows errors best-effort`() {
        // Stub returns 500 (non-success) — revoke must swallow it silently
        wm.stubFor(post("/revoke").willReturn(aResponse().withStatus(500)))
        flow.revoke("someToken") // must not throw
    }

    @Test fun `probe maps unknown error to ERROR`() {
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(400)
            .withHeader("Content-Type","application/json; charset=UTF-8")
            .withBody("""{"error":"unsupported_grant_type"}""")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.ERROR)
    }

    @Test fun `probe returns ERROR on non-JSON response`() {
        // Stub returns 500 with non-JSON body — triggers generic Exception catch arm
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(500)
            .withHeader("Content-Type","text/plain").withBody("Internal Server Error")))
        assertThat(flow.probe("cid","sec","http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.ERROR)
    }

    @Test fun `fetchUserInfo uses sub field when id is absent`() {
        // Response has "sub" but no "id" — covers the `map["id"] ?: map["sub"]` fallback branch
        wm.stubFor(get("/userinfo").willReturn(okJson(
            """{"sub":"SUB123","email":"b@c.de","name":"Mama"}""")))
        val u = flow.fetchUserInfo("AT2")
        assertThat(u.sub).isEqualTo("SUB123")
        assertThat(u.email).isEqualTo("b@c.de")
        assertThat(u.name).isEqualTo("Mama")
        assertThat(u.picture).isNull()
    }

    @Test fun `fetchUserInfo uses id field when present`() {
        // Response has "id" (not "sub") — covers the primary branch of `map["id"] ?: map["sub"]`
        wm.stubFor(get("/userinfo").willReturn(okJson(
            """{"id":"ID456","sub":"SUBIGNORED","email":"c@d.de","name":"Kind","picture":"http://pic"}""")))
        val u = flow.fetchUserInfo("AT3")
        assertThat(u.sub).isEqualTo("ID456")
        assertThat(u.email).isEqualTo("c@d.de")
    }

    @Test fun `fetchUserInfo returns null name when name field is absent`() {
        // Exercises the missed branch: map["name"] == null → name?.toString() returns null
        wm.stubFor(get("/userinfo").willReturn(okJson(
            """{"sub":"SUB789","email":"d@e.de"}""")))
        val u = flow.fetchUserInfo("AT4")
        assertThat(u.sub).isEqualTo("SUB789")
        assertThat(u.email).isEqualTo("d@e.de")
        assertThat(u.name).isNull()
        assertThat(u.picture).isNull()
    }

    @Test fun `probe maps 400 invalid_client body to CLIENT_INVALID`() {
        // Exercises the missed branch: ex.details?.error == "invalid_client" → true → CLIENT_INVALID
        // (distinct from the 401-status path which short-circuits at ex.statusCode == 401)
        wm.stubFor(post("/token").willReturn(aResponse().withStatus(400)
            .withHeader("Content-Type", "application/json; charset=UTF-8")
            .withBody("""{"error":"invalid_client"}""")))
        assertThat(flow.probe("cid", "sec", "http://localhost:8080/oauth/callback"))
            .isEqualTo(ProbeResult.CLIENT_INVALID)
    }
}
