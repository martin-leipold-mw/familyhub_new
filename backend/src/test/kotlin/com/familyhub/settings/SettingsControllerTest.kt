package com.familyhub.settings

import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@WebMvcTest(SettingsController::class)
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
class SettingsControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var settingsService: SettingsService

    @Test
    fun `GET setup-status returns status json`() {
        every { settingsService.getSetupStatus() } returns SetupStatusResponse(
            setupCompleted = false, currentStep = 1, hasFamilyMembers = false, hasPin = false
        )
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            status { isOk() }
            jsonPath("$.setupCompleted") { value(false) }
            jsonPath("$.currentStep") { value(1) }
        }
    }

    @Test
    fun `POST set-pin returns session token`() {
        every { settingsService.setPin("1234") } returns "550e8400-e29b-41d4-a716-446655440000"
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { value("550e8400-e29b-41d4-a716-446655440000") }
        }
    }

    @Test
    fun `POST set-pin maps SetupAlreadyCompleted to 403`() {
        every { settingsService.setPin("1234") } throws SetupAlreadyCompletedException()
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("SETUP_COMPLETED") }
        }
    }

    @Test
    fun `POST verify-pin returns session token`() {
        every { settingsService.verifyPin("1234") } returns "550e8400-e29b-41d4-a716-446655440001"
        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { value("550e8400-e29b-41d4-a716-446655440001") }
        }
    }

    @Test
    fun `POST change-pin returns 204`() {
        every { settingsService.changePin("1234", "5678") } returns Unit
        mockMvc.post("/api/v1/settings/change-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPin":"1234","newPin":"5678"}"""
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `POST setup-step returns 204`() {
        every { settingsService.updateSetupStep(2) } returns Unit
        mockMvc.post("/api/v1/settings/setup-step") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"step":2}"""
        }.andExpect {
            status { isNoContent() }
        }
    }
}
