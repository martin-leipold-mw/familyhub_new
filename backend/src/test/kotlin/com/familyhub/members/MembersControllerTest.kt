package com.familyhub.members

import com.familyhub.generated.model.MemberResponse
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.slot
import io.mockk.verify
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
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@WebMvcTest(controllers = [MembersController::class, MemberAvatarController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class MembersControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var memberService: MemberService

    private fun response(id: UUID = UUID.randomUUID()) =
        MemberResponse(
            id = id, name = "Anna", role = "parent", color = "blue",
            isActive = true,
            createdAt = OffsetDateTime.of(2026, 7, 22, 10, 0, 0, 0, ZoneOffset.UTC),
            updatedAt = OffsetDateTime.of(2026, 7, 22, 10, 0, 0, 0, ZoneOffset.UTC),
            dateOfBirth = null, avatarUrl = null,
        )

    @Test
    fun `GET members returns list`() {
        every { memberService.list() } returns listOf(response())
        mockMvc.get("/api/v1/members").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Anna") }
        }
    }

    @Test
    fun `POST members creates and returns 201`() {
        every { memberService.create(any()) } returns response()
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"parent","color":"blue"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Anna") }
        }
    }

    @Test
    fun `POST members rejects bad role via bean validation`() {
        mockMvc.post("/api/v1/members") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"boss","color":"blue"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
        }
    }

    @Test
    fun `PUT members updates and returns 200`() {
        val id = UUID.randomUUID()
        every { memberService.update(eq(id), any()) } returns response(id)
        mockMvc.put("/api/v1/members/$id") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Anna","role":"parent","color":"blue"}"""
        }.andExpect {
            status { isOk() }
        }
    }

    @Test
    fun `DELETE members returns 204`() {
        val id = UUID.randomUUID()
        every { memberService.delete(id) } returns Unit
        mockMvc.delete("/api/v1/members/$id").andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `GET avatar returns jpeg bytes`() {
        val id = UUID.randomUUID()
        every { memberService.getAvatar(id) } returns byteArrayOf(1, 2, 3)
        mockMvc.get("/api/v1/members/$id/avatar").andExpect {
            status { isOk() }
            content { contentType(MediaType.IMAGE_JPEG) }
        }
    }

    @Test
    fun `GET avatar 404 when missing`() {
        val id = UUID.randomUUID()
        every { memberService.getAvatar(id) } throws MemberNotFoundException()
        mockMvc.get("/api/v1/members/$id/avatar").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `PUT avatar stores bytes and returns 204`() {
        val id = UUID.randomUUID()
        every { memberService.saveAvatar(eq(id), any()) } returns Unit
        val bytes = slot<ByteArray>()
        mockMvc.put("/api/v1/members/$id/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = byteArrayOf(4, 5, 6)
        }.andExpect {
            status { isNoContent() }
        }
        verify { memberService.saveAvatar(eq(id), capture(bytes)) }
        assert(bytes.captured.contentEquals(byteArrayOf(4, 5, 6)))
    }

    @Test
    fun `PUT avatar rejects oversized body with 413`() {
        val id = UUID.randomUUID()
        mockMvc.put("/api/v1/members/$id/avatar") {
            contentType = MediaType.IMAGE_JPEG
            content = ByteArray(500 * 1024 + 1)
        }.andExpect {
            status { isEqualTo(413) }
            jsonPath("$.code") { value("PAYLOAD_TOO_LARGE") }
        }
    }
}
