package com.familyhub.google

import com.familyhub.BaseIntegrationTest
import com.fasterxml.jackson.databind.ObjectMapper
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.get
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

/**
 * End-to-end integration test for the whole Google flow, running the real Spring context
 * (Testcontainers Postgres) against a WireMock-stubbed Google.
 *
 * Flow: credentials → authorize → callback → connection → calendars → select → sync → events.
 * Plus PIN enforcement once setup is completed.
 *
 * @Transactional gives per-test rollback isolation; uncommitted state (connection, events,
 * setup.completed) is visible across the MockMvc calls within the single test transaction —
 * exactly like Schritt2FlowIntegrationTest relies on (the PIN interceptor sees the uncommitted
 * setup.completed=true).
 */
@Transactional
class GoogleFlowIntegrationTest : BaseIntegrationTest() {

    @Autowired
    lateinit var objectMapper: ObjectMapper

    companion object {
        // Started in the companion init (like the Testcontainers singleton in BaseIntegrationTest)
        // so it is up before @DynamicPropertySource runs.
        val wm: WireMockServer = WireMockServer(options().dynamicPort()).apply { start() }

        // Aggregated with BaseIntegrationTest's datasource @DynamicPropertySource — Spring
        // collects @DynamicPropertySource methods across the whole class hierarchy.
        @JvmStatic
        @DynamicPropertySource
        fun googleProps(registry: DynamicPropertyRegistry) {
            registry.add("google.token-url") { "${wm.baseUrl()}/token" }
            registry.add("google.userinfo-url") { "${wm.baseUrl()}/userinfo" }
            registry.add("google.revoke-url") { "${wm.baseUrl()}/revoke" }
            registry.add("google.authorize-url") { "https://accounts.google.com/o/oauth2/v2/auth" }
            // Trailing slash: the Calendar client does setRootUrl(baseUrl) then appends "calendar/v3/...".
            registry.add("google.api-base-url") { "${wm.baseUrl()}/" }
        }
    }

    @BeforeEach
    fun stubGoogle() {
        wm.resetAll()

        wm.stubFor(
            post(urlPathEqualTo("/token")).willReturn(
                okJson(
                    """
                    {
                      "access_token": "AT",
                      "refresh_token": "RT",
                      "expires_in": 3600,
                      "token_type": "Bearer",
                      "scope": "https://www.googleapis.com/auth/calendar"
                    }
                    """.trimIndent()
                )
            )
        )

        wm.stubFor(
            get(urlPathEqualTo("/userinfo")).willReturn(
                okJson(
                    """
                    {
                      "id": "g-123",
                      "email": "papa@example.de",
                      "name": "Papa"
                    }
                    """.trimIndent()
                )
            )
        )

        // Loose regexes so the URL-encoded calendarId ('@' → '%40') doesn't break matching.
        wm.stubFor(
            get(urlPathMatching(".*/calendarList.*")).willReturn(
                okJson(
                    """
                    {
                      "items": [
                        {
                          "id": "cal1@group.calendar.google.com",
                          "summary": "Familie",
                          "backgroundColor": "#ff0000",
                          "primary": true
                        }
                      ]
                    }
                    """.trimIndent()
                )
            )
        )

        wm.stubFor(
            get(urlPathMatching(".*/calendars/.*/events.*")).willReturn(
                okJson(
                    """
                    {
                      "items": [
                        {
                          "id": "evt1",
                          "summary": "Zahnarzt",
                          "status": "confirmed",
                          "start": { "dateTime": "2026-07-25T10:00:00Z" },
                          "end": { "dateTime": "2026-07-25T11:00:00Z" }
                        }
                      ],
                      "nextSyncToken": "synctoken-1"
                    }
                    """.trimIndent()
                )
            )
        )
    }

    private fun stateFrom(authUrl: String): String {
        val match = Regex("[?&]state=([^&]+)").find(authUrl)
            ?: error("No state param in authUrl: $authUrl")
        return java.net.URLDecoder.decode(match.groupValues[1], "UTF-8")
    }

    @Test
    fun `full google flow plus pin enforcement`() {
        // 1. Create credentials (setup not completed yet → @RequiresPinSession inactive → no PIN needed).
        val credBody = mockMvc.post("/api/v1/google/credentials") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "nickname": "Familie",
                  "clientId": "cid.apps.googleusercontent.com",
                  "clientSecret": "GOCSPX-x",
                  "redirectUri": "http://localhost:8080/oauth/callback"
                }
            """.trimIndent()
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val credentialsId = objectMapper.readTree(credBody).get("id").asText()

        // 2. Authorize → get authUrl, extract state.
        val authBody = mockMvc.get("/api/v1/google/auth/authorize") {
            param("credentialsId", credentialsId)
            param("returnUrl", "/setup")
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val authUrl = objectMapper.readTree(authBody).get("authUrl").asText()
        val state = stateFrom(authUrl)

        // 3. Callback → hits WireMock /token + /userinfo.
        val callbackBody = mockMvc.post("/api/v1/google/auth/callback") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("code" to "code-123", "state" to state))
        }.andExpect {
            status { isOk() }
            jsonPath("$.memberName") { value("Papa") }
            jsonPath("$.isNewMember") { value(true) }
            jsonPath("$.returnUrl") { value("/setup") }
        }.andReturn().response.contentAsString
        val memberId = objectMapper.readTree(callbackBody).get("memberId").asText()

        // 4. Connection appears.
        mockMvc.get("/api/v1/google/connections").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].email") { value("papa@example.de") }
        }

        // 5. Calendars (triggers refreshCalendars → WireMock calendarList).
        mockMvc.get("/api/v1/google/calendars") {
            param("memberId", memberId)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value("cal1@group.calendar.google.com") }
            jsonPath("$[0].summary") { value("Familie") }
        }

        // 6. Select the calendar.
        mockMvc.put("/api/v1/google/calendars/selected") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "memberId" to memberId,
                    "calendarIds" to listOf("cal1@group.calendar.google.com"),
                )
            )
        }.andExpect { status { isOk() } }

        // 7. Sync → WireMock events → 1 event imported.
        mockMvc.post("/api/v1/google/calendars/sync") {
            param("memberId", memberId)
        }.andExpect {
            status { isOk() }
            jsonPath("$.created") { value(1) }
        }

        // 8. Events endpoint returns the imported event.
        mockMvc.get("/api/v1/events") {
            param("memberId", memberId)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].title") { value("Zahnarzt") }
        }

        // 9. PIN enforcement: complete setup, then credentials-create WITHOUT session → 401.
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/api/v1/google/credentials") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "nickname": "Zweit",
                  "clientId": "cid2.apps.googleusercontent.com",
                  "clientSecret": "GOCSPX-y",
                  "redirectUri": "http://localhost:8080/oauth/callback"
                }
            """.trimIndent()
        }.andExpect { status { isUnauthorized() } }
    }
}
