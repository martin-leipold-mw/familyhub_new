package com.familyhub.shared.exceptions

import com.familyhub.shared.health.HealthController
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.ResponseEntity
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
class GlobalExceptionHandlerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var healthController: HealthController

    @Test
    @WithMockUser
    fun `GET unknown path returns 404 with NOT_FOUND error`() {
        every { healthController.getHealth() } returns ResponseEntity.ok(
            com.familyhub.generated.model.HealthResponse(
                status = com.familyhub.generated.model.HealthResponse.Status.UP,
                timestamp = java.time.OffsetDateTime.now(),
                version = "test",
            )
        )
        mockMvc.get("/api/nonexistent-endpoint-xyz")
            .andExpect {
                status { isNotFound() }
                content { contentType("application/json") }
                jsonPath("$.code") { value("NOT_FOUND") }
            }
    }

    @Test
    @WithMockUser
    fun `unhandled exception returns 500 with INTERNAL_ERROR`() {
        every { healthController.getHealth() } throws RuntimeException("test error")
        mockMvc.get("/api/health")
            .andExpect {
                status { isInternalServerError() }
                content { contentType("application/json") }
                jsonPath("$.code") { value("INTERNAL_ERROR") }
                jsonPath("$.correlationId") { exists() }
            }
    }
}
