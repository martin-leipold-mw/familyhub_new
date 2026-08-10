package com.familyhub.google.tasks

import com.familyhub.pin.PinSessionService
import com.familyhub.settings.Setting
import com.familyhub.settings.SettingRepository
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
import java.util.Optional
import java.util.UUID

@WebMvcTest(controllers = [TaskListController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class TaskListControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: TaskListQueryService

    // Present so PinSessionInterceptor gets registered by InterceptorConfig for
    // this slice too (see InterceptorConfig's doc comment: it stays unregistered
    // whenever these beans are absent from the context).
    @MockkBean
    lateinit var pinSessionService: PinSessionService

    @MockkBean
    lateinit var settingRepository: SettingRepository

    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")

    // ─── GET /v1/google/task-lists ─────────────────────────────────────────────

    @Test
    fun `GET task-lists without memberId returns all lists`() {
        every { service.listAll() } returns
            listOf(
                TaskListView(id = "l1", title = "Einkauf", isSelected = true, isWriteTarget = true, memberId = memberId),
            )

        mockMvc.get("/api/v1/google/task-lists").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("l1") }
            jsonPath("$[0].title") { value("Einkauf") }
            jsonPath("$[0].isSelected") { value(true) }
            jsonPath("$[0].isWriteTarget") { value(true) }
        }
    }

    @Test
    fun `GET task-lists with memberId filters by member`() {
        every { service.listForMember(memberId) } returns
            listOf(
                TaskListView(id = "l2", title = "Arbeit", isSelected = false, isWriteTarget = false, memberId = memberId),
            )

        mockMvc.get("/api/v1/google/task-lists?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value("l2") }
            jsonPath("$[0].isSelected") { value(false) }
        }
    }

    // ─── PUT /v1/google/task-lists/selected ────────────────────────────────────

    @Test
    fun `PUT selected without a valid pin session returns 401`() {
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = "true"))

        mockMvc.put("/api/v1/google/task-lists/selected") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"memberId":"$memberId","taskListIds":["l1"]}"""
        }.andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `PUT selected with a valid pin session returns 200`() {
        val token = UUID.randomUUID()
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = "true"))
        every { pinSessionService.isValid(token) } returns true
        justRun { service.saveSelection(memberId, listOf("l1"), "l1") }

        mockMvc.put("/api/v1/google/task-lists/selected") {
            contentType = MediaType.APPLICATION_JSON
            header("X-Pin-Session", token.toString())
            content = """{"memberId":"$memberId","taskListIds":["l1"],"writeTargetId":"l1"}"""
        }.andExpect {
            status { isOk() }
        }
    }

    // ─── POST /v1/google/task-lists/sync ───────────────────────────────────────

    @Test
    fun `POST sync returns the sync result`() {
        every { service.syncForMember(memberId) } returns TaskSyncResult(created = 4, updated = 2, deleted = 1)

        mockMvc.post("/api/v1/google/task-lists/sync?memberId=$memberId").andExpect {
            status { isOk() }
            jsonPath("$.created") { value(4) }
            jsonPath("$.updated") { value(2) }
            jsonPath("$.deleted") { value(1) }
        }
    }
}
