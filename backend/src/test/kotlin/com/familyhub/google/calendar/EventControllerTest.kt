package com.familyhub.google.calendar

import com.familyhub.settings.SettingsService
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
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@WebMvcTest(controllers = [EventController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class EventControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var eventService: EventService

    @MockkBean
    lateinit var settingsService: SettingsService

    private val eventId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val memberId = UUID.fromString("00000000-0000-0000-0000-000000000002")

    private fun aView(
        id: UUID = eventId,
        title: String = "Test Event",
        isAllDay: Boolean = false,
        start: Instant? = Instant.parse("2026-07-24T10:00:00Z"),
        end: Instant? = Instant.parse("2026-07-24T11:00:00Z"),
        allDayStart: LocalDate? = null,
        allDayEnd: LocalDate? = null,
    ) = EventView(
        id = id,
        title = title,
        description = null,
        location = null,
        start = start,
        end = end,
        isAllDay = isAllDay,
        allDayStart = allDayStart,
        allDayEnd = allDayEnd,
        memberId = memberId,
        calendarId = "primary",
    )

    // ─── GET /v1/events — with full ISO instant start/end ─────────────────────

    @Test
    fun `GET events with full ISO instant start and end returns 200 list`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        every {
            eventService.list(
                Instant.parse("2026-07-24T00:00:00Z"),
                Instant.parse("2026-07-24T23:59:59Z"),
                null,
                null,
            )
        } returns listOf(aView())

        mockMvc.get("/api/v1/events?start=2026-07-24T00:00:00Z&end=2026-07-24T23:59:59Z")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].id") { value(eventId.toString()) }
                jsonPath("$[0].title") { value("Test Event") }
                jsonPath("$[0].isAllDay") { value(false) }
                jsonPath("$[0].memberId") { value(memberId.toString()) }
                jsonPath("$[0].calendarId") { value("primary") }
            }
    }

    // ─── GET /v1/events — date-only start/end exercises timezone fallback ──────

    @Test
    fun `GET events with date-only start uses family timezone to compute start of day`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        // 2026-07-24 start of day in Europe/Berlin = 2026-07-23T22:00:00Z (UTC+2 in summer)
        val expectedStart =
            java.time.LocalDate.parse("2026-07-24")
                .atStartOfDay(java.time.ZoneId.of("Europe/Berlin")).toInstant()
        val expectedEnd =
            java.time.LocalDate.parse("2026-07-25")
                .atStartOfDay(java.time.ZoneId.of("Europe/Berlin")).toInstant()

        every { eventService.list(expectedStart, expectedEnd, null, null) } returns listOf(aView())

        mockMvc.get("/api/v1/events?start=2026-07-24&end=2026-07-25")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].title") { value("Test Event") }
            }
    }

    // ─── GET /v1/events — no params (parseInstant null branch) ────────────────

    @Test
    fun `GET events without start end returns 200 list`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        every { eventService.list(null, null, null, null) } returns emptyList()

        mockMvc.get("/api/v1/events")
            .andExpect {
                status { isOk() }
                jsonPath("$") { isArray() }
            }
    }

    // ─── GET /v1/events — garbage start → 400 (ValidationException branch) ───

    @Test
    fun `GET events with garbage start returns 400`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        mockMvc.get("/api/v1/events?start=not-a-date")
            .andExpect {
                status { isBadRequest() }
            }
    }

    // ─── GET /v1/events/{id} — all-day event, null start/end in response ───────

    @Test
    fun `GET event by id returns 200 with all-day event and null timestamps`() {
        every { eventService.get(eventId) } returns
            aView(
                isAllDay = true,
                start = null,
                end = null,
                allDayStart = LocalDate.parse("2026-07-24"),
                allDayEnd = LocalDate.parse("2026-07-25"),
            )

        mockMvc.get("/api/v1/events/$eventId")
            .andExpect {
                status { isOk() }
                jsonPath("$.isAllDay") { value(true) }
                jsonPath("$.start") { doesNotExist() }
                jsonPath("$.end") { doesNotExist() }
                jsonPath("$.allDayStart") { value("2026-07-24") }
                jsonPath("$.allDayEnd") { value("2026-07-25") }
            }
    }

    // ─── GET /v1/events/{id} ──────────────────────────────────────────────────

    @Test
    fun `GET event by id returns 200 with event`() {
        every { eventService.get(eventId) } returns aView()

        mockMvc.get("/api/v1/events/$eventId")
            .andExpect {
                status { isOk() }
                jsonPath("$.id") { value(eventId.toString()) }
                jsonPath("$.title") { value("Test Event") }
                jsonPath("$.isAllDay") { value(false) }
            }
    }

    // ─── POST /v1/events → 201 ────────────────────────────────────────────────

    @Test
    fun `POST event returns 201 with created event`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        every { eventService.create(any()) } returns aView()

        mockMvc.post("/api/v1/events") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "memberId": "$memberId",
                  "title": "Test Event",
                  "isAllDay": false,
                  "start": "2026-07-24T10:00:00Z",
                  "end": "2026-07-24T11:00:00Z"
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(eventId.toString()) }
            jsonPath("$.title") { value("Test Event") }
        }
    }

    // ─── POST /v1/events — garbage start in body → 400 ────────────────────────

    @Test
    fun `POST event with garbage start in body returns 400`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        mockMvc.post("/api/v1/events") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "memberId": "$memberId",
                  "title": "Test Event",
                  "isAllDay": false,
                  "start": "not-a-date"
                }
                """.trimIndent()
        }.andExpect {
            status { isBadRequest() }
        }
    }

    // ─── PUT /v1/events/{id} → 200 ────────────────────────────────────────────

    @Test
    fun `PUT event returns 200 with updated event`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        every { eventService.update(eventId, any()) } returns aView(title = "Updated Event")

        mockMvc.put("/api/v1/events/$eventId") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "memberId": "$memberId",
                  "title": "Updated Event",
                  "isAllDay": false
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Updated Event") }
        }
    }

    // ─── DELETE /v1/events/{id} → 204 ─────────────────────────────────────────

    @Test
    fun `DELETE event returns 204`() {
        justRun { eventService.delete(eventId) }

        mockMvc.delete("/api/v1/events/$eventId")
            .andExpect {
                status { isNoContent() }
            }
    }

    // ─── GET /v1/events — with memberId and calendarId filters ────────────────

    @Test
    fun `GET events with memberId and calendarId filters returns 200`() {
        every { settingsService.timezone() } returns "Europe/Berlin"
        every { eventService.list(null, null, memberId, "primary") } returns listOf(aView())

        mockMvc.get("/api/v1/events?memberId=$memberId&calendarId=primary")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].calendarId") { value("primary") }
            }
    }
}
