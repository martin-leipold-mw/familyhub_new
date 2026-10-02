package com.familyhub.shared.security

import com.familyhub.shared.health.HealthController
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@WebMvcTest(HealthController::class)
@Import(SecurityConfig::class)
class SecurityConfigTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `health endpoint is publicly accessible`() {
        mockMvc.get("/api/health")
            .andExpect { status { isOk() } }
    }

    @Test
    fun `requests from the frontend origin behind the nginx proxy are not rejected`() {
        // nginx forwards "Host: nas2.local" without the port, while the browser sends
        // "Origin: http://nas2.local:3080" on its own same-origin requests.
        mockMvc.get("http://nas2.local/api/health") {
            header("Origin", "http://nas2.local:3080")
        }.andExpect { status { isOk() } }
    }
}
