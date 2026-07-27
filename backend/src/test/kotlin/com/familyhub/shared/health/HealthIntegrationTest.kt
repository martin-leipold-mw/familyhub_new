package com.familyhub.shared.health

import com.familyhub.BaseIntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.web.servlet.get

class HealthIntegrationTest : BaseIntegrationTest() {
    @Test
    @WithMockUser
    fun `health endpoint returns UP with real database`() {
        mockMvc.get("/api/health")
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("UP") }
                jsonPath("$.version") { value("integration-test") }
            }
    }
}
