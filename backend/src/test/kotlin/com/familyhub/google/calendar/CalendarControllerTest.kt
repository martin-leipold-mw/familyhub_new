package com.familyhub.google.calendar

import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.justRun
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@WebMvcTest(controllers = [CalendarController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class CalendarControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: CalendarQueryService

    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")

    // ─── GET /v1/google/calendars ─────────────────────────────────────────────

    @Test
    fun `GET calendars returns 200 with array of calendars`() {
        every { service.listForMember(memberId) } returns
            listOf(
                CalendarView(
                    id = "cal1@gmail.com",
                    summary = "Family",
                    backgroundColor = "#ff0000",
                    isPrimary = true,
                    isSelected = true,
                ),
                CalendarView(
                    id = "cal2@gmail.com",
                    summary = "Work",
                    backgroundColor = null,
                    isPrimary = false,
                    isSelected = false,
                ),
            )

        mockMvc.get("/api/v1/google/calendars?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("cal1@gmail.com") }
            jsonPath("$[0].summary") { value("Family") }
            jsonPath("$[0].backgroundColor") { value("#ff0000") }
            jsonPath("$[0].isPrimary") { value(true) }
            jsonPath("$[0].isSelected") { value(true) }
            jsonPath("$[1].id") { value("cal2@gmail.com") }
            jsonPath("$[1].isSelected") { value(false) }
        }
    }

    // ─── GET /v1/google/calendars — empty list ────────────────────────────────

    @Test
    fun `GET calendars returns 200 with empty array when no connection`() {
        every { service.listForMember(memberId) } returns emptyList()

        mockMvc.get("/api/v1/google/calendars?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
        }
    }

    // ─── PUT /v1/google/calendars/selected ───────────────────────────────────

    @Test
    fun `PUT selected calendars returns 200`() {
        justRun { service.saveSelection(memberId, listOf("cal1@gmail.com")) }

        mockMvc.put("/api/v1/google/calendars/selected") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"memberId":"$memberId","calendarIds":["cal1@gmail.com"]}"""
        }.andExpect {
            status { isOk() }
        }
    }

    // ─── POST /v1/google/calendars/sync ──────────────────────────────────────

    @Test
    fun `POST sync returns 200 with created, updated, deleted`() {
        every { service.syncForMember(memberId) } returns SyncResult(created = 5, updated = 2, deleted = 1)

        mockMvc.post("/api/v1/google/calendars/sync?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$.created") { value(5) }
            jsonPath("$.updated") { value(2) }
            jsonPath("$.deleted") { value(1) }
        }
    }
}
