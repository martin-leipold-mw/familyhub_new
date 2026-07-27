package com.familyhub.google.credentials

import com.familyhub.generated.model.GoogleCredentialsResponse
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@WebMvcTest(controllers = [CredentialsController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class CredentialsControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: CredentialsService

    private val testId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")

    private fun view(id: UUID = testId) =
        GoogleCredentialsView(
            id = id,
            nickname = "Test App",
            redirectUri = "https://familyhub.local/callback",
            isPrimary = true,
            isActive = true,
            createdAt = null,
        )

    private fun response(id: UUID = testId) =
        GoogleCredentialsResponse(
            id = id,
            nickname = "Test App",
            redirectUri = "https://familyhub.local/callback",
            isPrimary = true,
            isActive = true,
        )

    @Test
    fun `GET credentials returns list`() {
        every { service.list() } returns listOf(view())
        mockMvc.get("/api/v1/google/credentials").andExpect {
            status { isOk() }
            jsonPath("$[0].nickname") { value("Test App") }
            jsonPath("$[0].clientId") { doesNotExist() }
            jsonPath("$[0].clientSecret") { doesNotExist() }
        }
    }

    @Test
    fun `POST credentials creates and returns 201 without secrets in body`() {
        every { service.create(any()) } returns view()
        mockMvc.post("/api/v1/google/credentials") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"nickname":"Test App","clientId":"my-client-id","clientSecret":"my-secret","redirectUri":"https://familyhub.local/callback"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.nickname") { value("Test App") }
            jsonPath("$.redirectUri") { value("https://familyhub.local/callback") }
            jsonPath("$.isPrimary") { value(true) }
            jsonPath("$.isActive") { value(true) }
            jsonPath("$.clientId") { doesNotExist() }
            jsonPath("$.clientSecret") { doesNotExist() }
        }
    }

    @Test
    fun `GET credentials by id returns 200`() {
        every { service.get(testId) } returns view()
        mockMvc.get("/api/v1/google/credentials/$testId").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(testId.toString()) }
            jsonPath("$.nickname") { value("Test App") }
        }
    }

    @Test
    fun `PUT credentials updates and returns 200 with clientId and clientSecret present`() {
        every { service.update(eq(testId), any()) } returns view()
        mockMvc.put("/api/v1/google/credentials/$testId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"nickname":"Test App","clientId":"new-client-id","clientSecret":"new-secret","redirectUri":"https://familyhub.local/callback"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.nickname") { value("Test App") }
        }
    }

    @Test
    fun `PUT credentials updates and returns 200 when clientId and clientSecret omitted (null arm coverage)`() {
        every { service.update(eq(testId), any()) } returns view()
        mockMvc.put("/api/v1/google/credentials/$testId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"nickname":"Test App","redirectUri":"https://familyhub.local/callback"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.nickname") { value("Test App") }
        }
    }

    @Test
    fun `DELETE credentials returns 204`() {
        every { service.delete(testId) } returns Unit
        mockMvc.delete("/api/v1/google/credentials/$testId").andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `PUT credentials primary returns 200`() {
        every { service.setPrimary(testId) } returns view()
        mockMvc.put("/api/v1/google/credentials/$testId/primary").andExpect {
            status { isOk() }
            jsonPath("$.isPrimary") { value(true) }
        }
    }

    @Test
    fun `POST validate returns 200 with isValid`() {
        every { service.validate(any(), any(), any()) } returns ValidationResult(isValid = true, message = "Verbindung erfolgreich!")
        mockMvc.post("/api/v1/google/credentials/validate") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"clientId":"my-client-id","clientSecret":"my-secret","redirectUri":"https://familyhub.local/callback"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.isValid") { value(true) }
            jsonPath("$.message") { value("Verbindung erfolgreich!") }
        }
    }
}
