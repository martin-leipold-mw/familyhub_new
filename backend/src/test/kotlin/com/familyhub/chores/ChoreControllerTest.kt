package com.familyhub.chores

import com.familyhub.pin.PinSessionService
import com.familyhub.settings.Setting
import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.ValidationException
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
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

@WebMvcTest(controllers = [ChoreController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class ChoreControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: ChoreService

    // Vorhanden, damit InterceptorConfig den PinSessionInterceptor auch in
    // diesem Slice registriert (siehe dessen Doku-Kommentar).
    @MockkBean
    lateinit var pinSessionService: PinSessionService

    @MockkBean
    lateinit var settingRepository: SettingRepository

    private val choreId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000c1")
    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")
    private val token: String = UUID.randomUUID().toString()

    private fun view(open: OpenAssignmentView? = null) =
        ChoreView(
            id = choreId,
            name = "Toilette putzen",
            icon = "🚽",
            description = "Auch den Spiegel!",
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            points = 10,
            isActive = true,
            nextDueOn = LocalDate.of(2026, 9, 29),
            openAssignment = open,
        )

    private fun setupCompleted() {
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = "true"))
    }

    private fun validSession() {
        setupCompleted()
        every { pinSessionService.isValid(UUID.fromString(token)) } returns true
    }

    // ─── Lesen ist offen ──────────────────────────────────────────────────────

    @Test
    fun `GET chores liefert die Vorlagen`() {
        every { service.list(false) } returns listOf(view())

        mockMvc.get("/api/v1/chores").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Toilette putzen") }
            jsonPath("$[0].icon") { value("🚽") }
            jsonPath("$[0].intervalDays") { value(7) }
            jsonPath("$[0].assignmentGroup") { value("all") }
            jsonPath("$[0].nextDueOn") { value("2026-09-29") }
            jsonPath("$[0].openAssignment") { doesNotExist() }
        }
    }

    @Test
    fun `GET chores mit activeOnly reicht den Filter durch`() {
        every { service.list(true) } returns emptyList()

        mockMvc.get("/api/v1/chores?activeOnly=true").andExpect {
            status { isOk() }
            jsonPath("$") { isEmpty() }
        }
    }

    @Test
    fun `GET chores traegt die offene Zuweisung auf`() {
        every { service.list(false) } returns
            listOf(
                view(
                    OpenAssignmentView(
                        id = UUID.randomUUID(),
                        memberId = memberId,
                        memberName = "Anna",
                        assignedOn = LocalDate.of(2026, 9, 22),
                    ),
                ),
            )

        mockMvc.get("/api/v1/chores").andExpect {
            status { isOk() }
            jsonPath("$[0].openAssignment.memberName") { value("Anna") }
            jsonPath("$[0].openAssignment.assignedOn") { value("2026-09-22") }
        }
    }

    // ─── Schreiben ist PIN-geschützt ──────────────────────────────────────────

    @Test
    fun `POST chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.post("/api/v1/chores") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Müll","icon":"🗑️","intervalDays":1,"assignmentGroup":"all"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `PATCH chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.patch("/api/v1/chores/$choreId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"isActive":false}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `DELETE chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.delete("/api/v1/chores/$choreId").andExpect { status { isUnauthorized() } }
    }

    // ─── Schreibende Endpunkte mit gültiger Sitzung ───────────────────────────

    @Test
    fun `POST chores legt eine Vorlage an`() {
        validSession()
        val cmd = slot<CreateChoreCommand>()
        every { service.create(capture(cmd)) } returns view()

        mockMvc.post("/api/v1/chores") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"name":"Toilette putzen","icon":"🚽","description":"Auch den Spiegel!",""" +
                """"intervalDays":7,"assignmentGroup":"all","points":10}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Toilette putzen") }
        }

        assertThat(cmd.captured.assignmentGroup).isEqualTo(GROUP_ALL)
        assertThat(cmd.captured.points).isEqualTo(10)
    }

    @Test
    fun `POST chores ohne points faellt auf zehn zurueck`() {
        validSession()
        val cmd = slot<CreateChoreCommand>()
        every { service.create(capture(cmd)) } returns view()

        mockMvc.post("/api/v1/chores") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Müll","icon":"🗑️","intervalDays":1,"assignmentGroup":"children"}"""
        }.andExpect { status { isCreated() } }

        assertThat(cmd.captured.points).isEqualTo(10)
    }

    @Test
    fun `POST chores mit explizitem points null faellt auf zehn zurueck`() {
        validSession()
        val cmd = slot<CreateChoreCommand>()
        every { service.create(capture(cmd)) } returns view()

        mockMvc.post("/api/v1/chores") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Müll","icon":"🗑️","intervalDays":1,"assignmentGroup":"parents","points":null}"""
        }.andExpect { status { isCreated() } }

        assertThat(cmd.captured.points).isEqualTo(10)
    }

    @Test
    fun `PATCH chores reicht die Gruppe als Wert durch`() {
        validSession()
        val cmd = slot<UpdateChoreCommand>()
        every { service.update(choreId, capture(cmd)) } returns view()

        mockMvc.patch("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"assignmentGroup":"children"}"""
        }.andExpect { status { isOk() } }

        assertThat(cmd.captured.assignmentGroup).isEqualTo("children")
    }

    @Test
    fun `PATCH chores reicht clearFields durch`() {
        validSession()
        val cmd = slot<UpdateChoreCommand>()
        every { service.update(choreId, capture(cmd)) } returns view()

        mockMvc.patch("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad putzen","clearFields":["description"]}"""
        }.andExpect { status { isOk() } }

        assertThat(cmd.captured.clearDescription).isTrue()
        assertThat(cmd.captured.name).isEqualTo("Bad putzen")
    }

    @Test
    fun `PATCH chores ohne clearFields loescht nichts`() {
        validSession()
        val cmd = slot<UpdateChoreCommand>()
        every { service.update(choreId, capture(cmd)) } returns view()

        mockMvc.patch("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"isActive":false}"""
        }.andExpect { status { isOk() } }

        assertThat(cmd.captured.clearDescription).isFalse()
        assertThat(cmd.captured.isActive).isFalse()
    }

    @Test
    fun `DELETE chores loescht die Vorlage`() {
        validSession()
        justRun { service.delete(choreId) }

        mockMvc.delete("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `DELETE chores mit Historie ergibt 400 mit deutschem Text`() {
        validSession()
        val text = "Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren."
        every { service.delete(choreId) } throws ValidationException(text)

        mockMvc.delete("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.message") { value(text) }
        }
    }
}
