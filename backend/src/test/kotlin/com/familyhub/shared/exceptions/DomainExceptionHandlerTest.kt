package com.familyhub.shared.exceptions

import com.familyhub.shared.security.SecurityConfig
import io.mockk.every
import io.mockk.mockk
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.validation.BindingResult
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/test-errors")
private class ErrorProbeController {
    @GetMapping("/setup-completed")
    fun setup(): Nothing = throw SetupAlreadyCompletedException()

    @GetMapping("/invalid-pin")
    fun pin(): Nothing = throw InvalidPinException()

    @GetMapping("/validation")
    fun validation(): Nothing = throw ValidationException("Ungültig")

    @GetMapping("/not-found")
    fun notFound(): Nothing = throw MemberNotFoundException()

    @GetMapping("/too-large")
    fun tooLarge(): Nothing = throw PayloadTooLargeException()

    @GetMapping("/resource-not-found")
    fun rnf(): Nothing = throw ResourceNotFoundException("weg")

    @GetMapping("/google-revoked")
    fun rev(): Nothing = throw GoogleConnectionRevokedException()

    data class Body(
        @field:Size(min = 2) val name: String,
    )

    @PostMapping("/bean")
    fun bean(
        @Valid @RequestBody body: Body,
    ) = body.name
}

@WebMvcTest(ErrorProbeController::class)
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
class DomainExceptionHandlerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `setup completed maps to 403`() {
        mockMvc.get("/api/test-errors/setup-completed").andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("SETUP_COMPLETED") }
        }
    }

    @Test
    fun `invalid pin maps to 401`() {
        mockMvc.get("/api/test-errors/invalid-pin").andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("INVALID_PIN") }
        }
    }

    @Test
    fun `validation maps to 400`() {
        mockMvc.get("/api/test-errors/validation").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.message") { value("Ungültig") }
        }
    }

    @Test
    fun `member not found maps to 404`() {
        mockMvc.get("/api/test-errors/not-found").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("NOT_FOUND") }
        }
    }

    @Test
    fun `resource not found maps to 404`() {
        mockMvc.get("/api/test-errors/resource-not-found").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("NOT_FOUND") }
            jsonPath("$.message") { value("weg") }
        }
    }

    @Test
    fun `payload too large maps to 413`() {
        mockMvc.get("/api/test-errors/too-large").andExpect {
            status { isEqualTo(413) }
            jsonPath("$.code") { value("PAYLOAD_TOO_LARGE") }
        }
    }

    @Test
    fun `bean validation maps to 400`() {
        mockMvc.post("/api/test-errors/bean") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"a"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
        }
    }

    @Test
    fun `google connection revoked maps to 409`() {
        mockMvc.get("/api/test-errors/google-revoked").andExpect {
            status { isEqualTo(409) }
            jsonPath("$.code") { value("GOOGLE_CONNECTION_REVOKED") }
            jsonPath("$.message") { value("Google-Verbindung abgelaufen. Bitte neu verbinden.") }
        }
    }

    @Test
    fun `bean validation with no field errors uses fallback message`() {
        val bindingResult = mockk<BindingResult>()
        every { bindingResult.fieldErrors } returns emptyList()
        val ex = mockk<MethodArgumentNotValidException>()
        every { ex.bindingResult } returns bindingResult

        val response = GlobalExceptionHandler().handleBeanValidation(ex)

        assertThat(response.statusCode.value()).isEqualTo(400)
        assertThat(response.body?.message).isEqualTo("Ungültige Anfrage")
    }
}
