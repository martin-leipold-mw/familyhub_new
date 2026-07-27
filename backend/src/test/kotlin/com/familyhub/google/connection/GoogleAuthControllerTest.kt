package com.familyhub.google.connection

import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.util.UUID

@WebMvcTest(controllers = [GoogleAuthController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class GoogleAuthControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: ConnectionService

    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val connectionId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")

    // ── authorizeGoogle ────────────────────────────────────────────────────────

    @Test
    fun `authorizeGoogle with returnUrl uses provided returnUrl`() {
        every { service.startAuthorization(null, "/dashboard") } returns "https://accounts.google.com/o/oauth2/auth?client_id=test"
        mockMvc.get("/api/v1/google/auth/authorize?returnUrl=/dashboard").andExpect {
            status { isOk() }
            jsonPath("$.authUrl") { value("https://accounts.google.com/o/oauth2/auth?client_id=test") }
        }
    }

    @Test
    fun `authorizeGoogle without returnUrl defaults to slash`() {
        every { service.startAuthorization(null, "/") } returns "https://accounts.google.com/o/oauth2/auth?client_id=default"
        mockMvc.get("/api/v1/google/auth/authorize").andExpect {
            status { isOk() }
            jsonPath("$.authUrl") { value("https://accounts.google.com/o/oauth2/auth?client_id=default") }
        }
    }

    // ── googleCallback ─────────────────────────────────────────────────────────

    @Test
    fun `googleCallback returns 200 with memberName`() {
        every { service.handleCallback("auth-code-123", "state-nonce-abc") } returns
            CallbackResult(memberId = memberId, memberName = "Anna", isNewMember = true, returnUrl = "/")
        mockMvc.post("/api/v1/google/auth/callback") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"code":"auth-code-123","state":"state-nonce-abc"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.memberName") { value("Anna") }
            jsonPath("$.isNewMember") { value(true) }
            jsonPath("$.returnUrl") { value("/") }
        }
    }

    // ── listConnections ────────────────────────────────────────────────────────

    @Test
    fun `listConnections includes connection with non-null lastSyncedAt`() {
        val syncedAt = Instant.parse("2026-07-23T10:00:00Z")
        every { service.listConnections() } returns
            listOf(
                ConnectionView(
                    connectionId = connectionId,
                    memberId = memberId,
                    email = "anna@example.com",
                    name = "Anna",
                    status = "active",
                    lastSyncedAt = syncedAt,
                    scopes = listOf("https://www.googleapis.com/auth/calendar"),
                ),
            )
        mockMvc.get("/api/v1/google/connections").andExpect {
            status { isOk() }
            jsonPath("$[0].email") { value("anna@example.com") }
            jsonPath("$[0].lastSyncedAt") { value(syncedAt.toString()) }
            jsonPath("$[0].status") { value("active") }
        }
    }

    @Test
    fun `listConnections includes connection with null lastSyncedAt`() {
        every { service.listConnections() } returns
            listOf(
                ConnectionView(
                    connectionId = connectionId,
                    memberId = memberId,
                    email = "bob@example.com",
                    name = "Bob",
                    status = "active",
                    lastSyncedAt = null,
                    scopes = emptyList(),
                ),
            )
        mockMvc.get("/api/v1/google/connections").andExpect {
            status { isOk() }
            jsonPath("$[0].email") { value("bob@example.com") }
            jsonPath("$[0].lastSyncedAt") { value(null as String?) }
        }
    }

    // ── disconnectConnection ───────────────────────────────────────────────────

    @Test
    fun `disconnectConnection returns 200`() {
        justRun { service.disconnect(connectionId) }
        mockMvc.post("/api/v1/google/connections/$connectionId/disconnect").andExpect {
            status { isOk() }
        }
    }

    // ── refreshConnection ──────────────────────────────────────────────────────

    @Test
    fun `refreshConnection returns 200`() {
        justRun { service.refreshConnection(connectionId) }
        mockMvc.post("/api/v1/google/connections/$connectionId/refresh").andExpect {
            status { isOk() }
        }
    }
}
