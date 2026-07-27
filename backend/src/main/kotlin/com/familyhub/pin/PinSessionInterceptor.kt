package com.familyhub.pin

import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.ErrorResponse
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import java.util.UUID

class PinSessionInterceptor(
    private val pinSessionService: PinSessionService,
    private val settingRepository: SettingRepository,
    private val objectMapper: ObjectMapper,
) : HandlerInterceptor {
    override fun preHandle(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any,
    ): Boolean {
        if (handler !is HandlerMethod) return true
        if (!handler.hasMethodAnnotation(RequiresPinSession::class.java)) return true
        if (!isSetupCompleted()) return true

        val header = request.getHeader("X-Pin-Session")
        if (header == null || !isValidToken(header)) {
            writeUnauthorized(response)
            return false
        }
        return true
    }

    private fun isSetupCompleted(): Boolean = settingRepository.findById("setup.completed").map { it.value == "true" }.orElse(false)

    private fun isValidToken(header: String): Boolean {
        val token =
            try {
                UUID.fromString(header)
            } catch (ex: IllegalArgumentException) {
                return false
            }
        return pinSessionService.isValid(token)
    }

    private fun writeUnauthorized(response: HttpServletResponse) {
        response.status = HttpStatus.UNAUTHORIZED.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.writer.write(
            objectMapper.writeValueAsString(
                ErrorResponse(code = "UNAUTHORIZED", message = "PIN-Sitzung erforderlich"),
            ),
        )
    }
}
