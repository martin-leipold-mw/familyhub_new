package com.familyhub.chores

import com.familyhub.pin.PinSessionService
import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@WebMvcTest(controllers = [ChoreAssignmentController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class ChoreAssignmentControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: ChoreAssignmentService

    @MockkBean
    lateinit var pinSessionService: PinSessionService

    @MockkBean
    lateinit var settingRepository: SettingRepository

    private val assignmentId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")

    private fun view(
        status: String = STATUS_OPEN,
        completedAt: Instant? = null,
    ) = ChoreAssignmentView(
        id = assignmentId,
        choreId = UUID.randomUUID(),
        memberId = UUID.randomUUID(),
        name = "Toilette putzen",
        icon = "🚽",
        description = "Auch den Spiegel!",
        status = status,
        points = 10,
        assignedOn = LocalDate.of(2026, 9, 22),
        completedAt = completedAt,
    )

    @Test
    fun `GET chore-assignments liefert die aktuellen Zuweisungen`() {
        every { service.listCurrent() } returns listOf(view())

        mockMvc.get("/api/v1/chore-assignments").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Toilette putzen") }
            jsonPath("$[0].icon") { value("🚽") }
            jsonPath("$[0].status") { value("open") }
            jsonPath("$[0].points") { value(10) }
            jsonPath("$[0].assignedOn") { value("2026-09-22") }
        }
    }

    @Test
    fun `POST complete hakt ohne PIN-Sitzung ab`() {
        val done = Instant.parse("2026-09-22T09:00:00Z")
        every { service.complete(assignmentId) } returns view(status = STATUS_COMPLETED, completedAt = done)

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/complete").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("completed") }
            jsonPath("$.completedAt") { value(done.toString()) }
        }
    }

    @Test
    fun `POST complete auf eine unbekannte Zuweisung ergibt 404`() {
        every { service.complete(assignmentId) } throws ResourceNotFoundException("Zuweisung nicht gefunden")

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/complete").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("NOT_FOUND") }
        }
    }

    @Test
    fun `POST undo oeffnet die Zuweisung wieder`() {
        every { service.undo(assignmentId) } returns view()

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/undo").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("open") }
            jsonPath("$.completedAt") { doesNotExist() }
        }
    }

    @Test
    fun `POST undo nach Fristablauf ergibt 400 mit deutschem Text`() {
        every { service.undo(assignmentId) } throws
            ValidationException("Rückgängig ist nur innerhalb von 5 Minuten möglich.")

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/undo").andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("Rückgängig ist nur innerhalb von 5 Minuten möglich.") }
        }
    }
}
