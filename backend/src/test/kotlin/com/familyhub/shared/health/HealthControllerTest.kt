package com.familyhub.shared.health

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
class HealthControllerTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    @WithMockUser
    fun `GET api health returns UP status`() {
        mockMvc.get("/api/health")
            .andExpect {
                status { isOk() }
                content { contentType("application/json") }
                jsonPath("$.status") { value("UP") }
                jsonPath("$.timestamp") { exists() }
                jsonPath("$.version") { exists() }
            }
    }
}
