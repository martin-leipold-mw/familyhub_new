package com.familyhub

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestMethodOrder
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
@Transactional
class Schritt2FlowIntegrationTest : BaseIntegrationTest() {
    @Autowired
    lateinit var objectMapper: ObjectMapper

    private fun tokenFrom(json: String): String = objectMapper.readTree(json).get("sessionToken").asText()

    @Test
    @Order(1)
    fun `full setup and protection flow`() {
        // 1. Initial status: nothing set up.
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            status { isOk() }
            jsonPath("$.setupCompleted") { value(false) }
            jsonPath("$.hasPin") { value(false) }
            jsonPath("$.hasFamilyMembers") { value(false) }
        }

        // 2. During setup, member creation is allowed WITHOUT a session.
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Papa","role":"parent","color":"blue"}"""
        }.andExpect { status { isCreated() } }

        // 3. Complete setup by setting a PIN → returns a session token.
        val setPinBody =
            mockMvc.post("/api/v1/settings/set-pin") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"pin":"1234"}"""
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val token = tokenFrom(setPinBody)

        // 4. Setup now complete.
        mockMvc.get("/api/v1/settings/setup-status").andExpect {
            jsonPath("$.setupCompleted") { value(true) }
            jsonPath("$.hasPin") { value(true) }
            jsonPath("$.hasFamilyMembers") { value(true) }
        }

        // 5. set-pin again is forbidden.
        mockMvc.post("/api/v1/settings/set-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"9999"}"""
        }.andExpect { status { isForbidden() } }

        // 6. Member creation now requires a session.
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Mama","role":"parent","color":"pink"}"""
        }.andExpect { status { isUnauthorized() } }

        // 7. With the token it works.
        val created =
            mockMvc.post("/api/v1/members") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Mama","role":"parent","color":"pink"}"""
                header("X-Pin-Session", token)
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val memberId = objectMapper.readTree(created).get("id").asText()

        // 8. Avatar round-trip (upload with token, read publicly).
        mockMvc.put("/api/v1/members/$memberId/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = byteArrayOf(10, 20, 30)
            header("X-Pin-Session", token)
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/api/v1/members/$memberId/avatar").andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_JPEG) }
        }

        // 9. change-pin requires session; then old PIN fails, new PIN opens a session.
        mockMvc.post("/api/v1/settings/change-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPin":"1234","newPin":"5678"}"""
            header("X-Pin-Session", token)
        }.andExpect { status { isNoContent() } }

        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"1234"}"""
        }.andExpect { status { isUnauthorized() } }

        mockMvc.post("/api/v1/settings/verify-pin") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"pin":"5678"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionToken") { exists() }
        }
    }
}
