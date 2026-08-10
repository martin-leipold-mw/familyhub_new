package com.familyhub.google.tasks

import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.justRun
import io.mockk.slot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@WebMvcTest(controllers = [TaskController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class TaskControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: TaskService

    private val taskId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val memberId = UUID.fromString("00000000-0000-0000-0000-000000000002")

    private fun aView(
        id: UUID = taskId,
        title: String = "Milch kaufen",
        notes: String? = null,
        dueDate: LocalDate? = null,
        status: String = "pending",
        priority: String? = null,
        completedAt: Instant? = null,
    ) = TaskView(
        id = id,
        memberId = memberId,
        title = title,
        notes = notes,
        dueDate = dueDate,
        status = status,
        priority = priority,
        completedAt = completedAt,
    )

    // ─── GET /v1/tasks ──────────────────────────────────────────────────────

    @Test
    fun `GET tasks returns the list`() {
        every { service.list(null) } returns
            listOf(
                aView(priority = "high", completedAt = Instant.parse("2026-08-10T09:00:00Z"), status = "completed"),
                aView(id = UUID.randomUUID(), priority = null, completedAt = null),
            )

        mockMvc.get("/api/v1/tasks").andExpect {
            status { isOk() }
            jsonPath("$[0].title") { value("Milch kaufen") }
            jsonPath("$[0].priority") { value("high") }
            jsonPath("$[0].completedAt") { value("2026-08-10T09:00:00Z") }
            jsonPath("$[0].status") { value("completed") }
            jsonPath("$[1].priority") { doesNotExist() }
            jsonPath("$[1].completedAt") { doesNotExist() }
        }
    }

    @Test
    fun `GET tasks passes the memberId filter through`() {
        every { service.list(memberId) } returns listOf(aView())

        mockMvc.get("/api/v1/tasks?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(taskId.toString()) }
        }
    }

    // ─── POST /v1/tasks ─────────────────────────────────────────────────────

    @Test
    fun `POST tasks returns 201 with the created task`() {
        val cmdSlot = slot<CreateTaskCommand>()
        every { service.create(capture(cmdSlot)) } returns aView(priority = "medium")

        mockMvc.post("/api/v1/tasks") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "memberId": "$memberId",
                  "title": "Milch kaufen",
                  "notes": "2 Liter",
                  "dueDate": "2026-08-15",
                  "priority": "medium"
                }
                """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("Milch kaufen") }
            jsonPath("$.priority") { value("medium") }
        }
        assertThat(cmdSlot.captured.priority).isEqualTo("medium")
        assertThat(cmdSlot.captured.dueDate).isEqualTo(LocalDate.of(2026, 8, 15))
    }

    @Test
    fun `POST tasks without priority creates task with null priority`() {
        val cmdSlot = slot<CreateTaskCommand>()
        every { service.create(capture(cmdSlot)) } returns aView()

        mockMvc.post("/api/v1/tasks") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"memberId": "$memberId", "title": "Milch kaufen"}"""
        }.andExpect {
            status { isCreated() }
        }
        assertThat(cmdSlot.captured.priority).isNull()
    }

    // ─── PATCH /v1/tasks/{id} ───────────────────────────────────────────────

    @Test
    fun `PATCH tasks returns 200 with the updated task`() {
        val cmdSlot = slot<UpdateTaskCommand>()
        every { service.update(taskId, capture(cmdSlot)) } returns
            aView(title = "Aktualisiert", priority = "low", status = "completed", completedAt = Instant.parse("2026-08-10T10:00:00Z"))

        mockMvc.patch("/api/v1/tasks/$taskId") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                  "title": "Aktualisiert",
                  "priority": "low",
                  "status": "completed"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Aktualisiert") }
            jsonPath("$.priority") { value("low") }
            jsonPath("$.status") { value("completed") }
        }
        assertThat(cmdSlot.captured.priority).isEqualTo("low")
        assertThat(cmdSlot.captured.status).isEqualTo("completed")
    }

    @Test
    fun `PATCH tasks without priority or status leaves them null`() {
        val cmdSlot = slot<UpdateTaskCommand>()
        every { service.update(taskId, capture(cmdSlot)) } returns aView(title = "Nur Titel")

        mockMvc.patch("/api/v1/tasks/$taskId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title": "Nur Titel"}"""
        }.andExpect {
            status { isOk() }
        }
        assertThat(cmdSlot.captured.priority).isNull()
        assertThat(cmdSlot.captured.status).isNull()
    }

    // ─── DELETE /v1/tasks/{id} ──────────────────────────────────────────────

    @Test
    fun `DELETE tasks returns 204`() {
        justRun { service.delete(taskId) }

        mockMvc.delete("/api/v1/tasks/$taskId").andExpect {
            status { isNoContent() }
        }
    }
}
