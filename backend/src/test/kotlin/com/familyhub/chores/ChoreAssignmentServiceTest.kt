package com.familyhub.chores

import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class ChoreAssignmentServiceTest {
    private val assignmentRepository = mockk<ChoreAssignmentRepository>()
    private val choreRepository = mockk<ChoreRepository>()
    private val choreClock = mockk<ChoreClock>()

    private val today = LocalDate.of(2026, 9, 22)
    private val now = Instant.parse("2026-09-22T09:00:00Z")

    private val choreId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()
    private val assignmentId = UUID.randomUUID()

    private lateinit var service: ChoreAssignmentService

    private fun chore() =
        Chore(
            name = "Toilette putzen",
            icon = "🚽",
            description = "Auch den Spiegel!",
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            nextDueOn = today,
        ).also { it.id = choreId }

    private fun assignment(
        status: String = STATUS_OPEN,
        completedAt: Instant? = null,
    ) = ChoreAssignment(
        choreId = choreId,
        memberId = memberId,
        status = status,
        points = 10,
        assignedOn = today,
        completedAt = completedAt,
    ).also { it.id = assignmentId }

    @BeforeEach
    fun setUp() {
        every { choreClock.today() } returns today
        every { choreClock.now() } returns now
        every { choreClock.startOfToday() } returns Instant.parse("2026-09-21T22:00:00Z")
        every { assignmentRepository.save(any()) } answers { firstArg() }
        every { choreRepository.save(any()) } answers { firstArg() }
        service = ChoreAssignmentService(assignmentRepository, choreRepository, choreClock)
    }

    // ─── listCurrent ──────────────────────────────────────────────────────────

    @Test
    fun `listCurrent traegt Name Emoji und Beschreibung der Vorlage auf`() {
        val a = assignment()
        every {
            assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(
                STATUS_OPEN,
                Instant.parse("2026-09-21T22:00:00Z"),
            )
        } returns listOf(a)
        every { choreRepository.findAllById(listOf(choreId)) } returns listOf(chore())

        val views = service.listCurrent()

        assertThat(views).hasSize(1)
        assertThat(views[0].name).isEqualTo("Toilette putzen")
        assertThat(views[0].icon).isEqualTo("🚽")
        assertThat(views[0].description).isEqualTo("Auch den Spiegel!")
        assertThat(views[0].memberId).isEqualTo(memberId)
        assertThat(views[0].points).isEqualTo(10)
    }

    @Test
    fun `listCurrent liefert bei leerem Bestand eine leere Liste`() {
        every { assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(any(), any()) } returns emptyList()
        every { choreRepository.findAllById(emptyList()) } returns emptyList()

        assertThat(service.listCurrent()).isEmpty()
    }

    // ─── complete ─────────────────────────────────────────────────────────────

    @Test
    fun `Erledigen setzt nextDueOn auf heute plus Intervall`() {
        val a = assignment()
        val c = chore()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.complete(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_COMPLETED)
        assertThat(view.completedAt).isEqualTo(now)
        assertThat(c.nextDueOn).isEqualTo(LocalDate.of(2026, 9, 29))
        verify { choreRepository.save(c) }
    }

    @Test
    fun `Erledigen ist idempotent`() {
        val bereits = Instant.parse("2026-09-22T08:00:00Z")
        val a = assignment(status = STATUS_COMPLETED, completedAt = bereits)
        val c = chore()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.complete(assignmentId)

        assertThat(view.completedAt).isEqualTo(bereits)
        assertThat(c.nextDueOn).isEqualTo(today)
        verify(exactly = 0) { choreRepository.save(any()) }
    }

    @Test
    fun `Erledigen einer unbekannten Zuweisung ergibt 404`() {
        every { assignmentRepository.findById(assignmentId) } returns Optional.empty()

        assertThatThrownBy { service.complete(assignmentId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Zuweisung")
    }

    // ─── undo ─────────────────────────────────────────────────────────────────

    @Test
    fun `Ruecknahme innerhalb der Frist oeffnet die Zuweisung wieder`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(120))
        val c = chore().also { it.nextDueOn = LocalDate.of(2026, 9, 29) }
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.undo(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_OPEN)
        assertThat(view.completedAt).isNull()
        // nextDueOn bleibt unberührt: der partielle Unique-Index verhindert eine
        // erneute Ausgabe, und die nächste Erledigung überschreibt den Wert ohnehin.
        assertThat(c.nextDueOn).isEqualTo(LocalDate.of(2026, 9, 29))
        verify(exactly = 0) { choreRepository.save(any()) }
    }

    @Test
    fun `Ruecknahme genau an der Fristgrenze ist noch erlaubt`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(UNDO_WINDOW_SECONDS))
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThat(service.undo(assignmentId).status).isEqualTo(STATUS_OPEN)
    }

    @Test
    fun `Ruecknahme nach Ablauf der Frist ergibt 400 mit deutschem Text`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(301))
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThatThrownBy { service.undo(assignmentId) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Rückgängig ist nur innerhalb von 5 Minuten möglich.")
    }

    @Test
    fun `Ruecknahme einer offenen Zuweisung ist idempotent`() {
        val a = assignment()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        val view = service.undo(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_OPEN)
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `Ruecknahme einer unbekannten Zuweisung ergibt 404`() {
        every { assignmentRepository.findById(assignmentId) } returns Optional.empty()

        assertThatThrownBy { service.undo(assignmentId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }
}
