package com.familyhub.pin

import com.familyhub.settings.Setting
import com.familyhub.settings.SettingRepository
import com.fasterxml.jackson.databind.ObjectMapper
import io.mockk.every
import io.mockk.mockk
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.web.method.HandlerMethod
import java.io.PrintWriter
import java.io.StringWriter
import java.util.Optional
import java.util.UUID

class PinSessionInterceptorTest {
    private val sessionService = mockk<PinSessionService>()
    private val settingRepository = mockk<SettingRepository>()
    private val interceptor = PinSessionInterceptor(sessionService, settingRepository, ObjectMapper())

    // A real handler method carrying (or not carrying) the annotation.
    @RequiresPinSession
    fun protectedHandler() = Unit

    fun openHandler() = Unit

    private fun handlerMethod(name: String) = HandlerMethod(this, this::class.java.getDeclaredMethod(name))

    private fun setupCompleted(value: Boolean) {
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = value.toString()))
    }

    private fun response(): Pair<HttpServletResponse, StringWriter> {
        val writer = StringWriter()
        val response = mockk<HttpServletResponse>(relaxed = true)
        every { response.writer } returns PrintWriter(writer)
        return response to writer
    }

    @Test
    fun `non-handler-method passes through`() {
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, "not-a-handler-method")).isTrue()
    }

    @Test
    fun `unannotated handler passes through`() {
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("openHandler"))).isTrue()
    }

    @Test
    fun `protected handler passes through while setup incomplete`() {
        setupCompleted(false)
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isTrue()
    }

    @Test
    fun `protected handler passes through when setup_completed setting is absent`() {
        every { settingRepository.findById("setup.completed") } returns Optional.empty()
        val req = mockk<HttpServletRequest>()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isTrue()
    }

    @Test
    fun `protected handler with missing header returns 401`() {
        setupCompleted(true)
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns null
        val (res, writer) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
        assertThat(writer.toString()).contains("UNAUTHORIZED")
    }

    @Test
    fun `protected handler with non-uuid header returns 401`() {
        setupCompleted(true)
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns "not-a-uuid"
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
    }

    @Test
    fun `protected handler with invalid token returns 401`() {
        setupCompleted(true)
        val token = UUID.randomUUID()
        every { sessionService.isValid(token) } returns false
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns token.toString()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isFalse()
    }

    @Test
    fun `protected handler with valid token passes through`() {
        setupCompleted(true)
        val token = UUID.randomUUID()
        every { sessionService.isValid(token) } returns true
        val req = mockk<HttpServletRequest>()
        every { req.getHeader("X-Pin-Session") } returns token.toString()
        val (res, _) = response()
        assertThat(interceptor.preHandle(req, res, handlerMethod("protectedHandler"))).isTrue()
    }
}
