package com.familyhub.chores

import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.util.UUID

class ChoreRefillServiceTest {
    private val choreRepository = mockk<ChoreRepository>()
    private val assignmentRepository = mockk<ChoreAssignmentRepository>(relaxed = true)
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val choreClock = mockk<ChoreClock>()
    private val transactionTemplate = mockk<TransactionTemplate>()

    private val today = LocalDate.of(2026, 9, 22)

    private fun member(
        name: String,
        role: String,
    ) = FamilyMember(name = name, role = role, color = "blue").also { it.id = UUID.randomUUID() }

    private val papa = member("Papa", "parent")
    private val anna = member("Anna", "child")

    private fun chore(
        name: String,
        group: String = GROUP_ALL,
        due: LocalDate = today,
        last: UUID? = null,
    ) = Chore(
        name = name,
        icon = "🧹",
        intervalDays = 7,
        assignmentGroup = group,
        nextDueOn = due,
        lastAssignedMemberId = last,
    ).also { it.id = UUID.randomUUID() }

    private lateinit var service: ChoreRefillService

    @BeforeEach
    fun setUp() {
        // Die Transaktionsgrenze selbst ist nicht Gegenstand dieses Tests —
        // der Callback wird direkt ausgeführt.
        every { transactionTemplate.execute<Any>(any()) } answers {
            firstArg<TransactionCallback<Any>>().doInTransaction(mockk(relaxed = true))
        }
        every { choreClock.today() } returns today
        every { choreRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns emptyList()
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(papa, anna)
        every { assignmentRepository.countByMemberIdAndStatus(any(), STATUS_OPEN) } returns 0
        service =
            ChoreRefillService(
                choreRepository,
                assignmentRepository,
                memberRepository,
                choreClock,
                transactionTemplate,
                maxOpenPerMember = 5,
            )
    }

    private fun due(vararg chores: Chore) {
        every {
            choreRepository.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
        } returns chores.toList()
        chores.forEach {
            every { assignmentRepository.existsByChoreIdAndStatus(it.id!!, STATUS_OPEN) } returns false
        }
    }

    @Test
    fun `gibt eine faellige Vorlage an das erste Mitglied aus`() {
        val c = chore("Toilette putzen")
        due(c)
        val saved = slot<ChoreAssignment>()
        every { assignmentRepository.save(capture(saved)) } answers { firstArg() }

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 1, waiting = 0))
        assertThat(saved.captured.memberId).isEqualTo(papa.id)
        assertThat(saved.captured.choreId).isEqualTo(c.id)
        assertThat(saved.captured.status).isEqualTo(STATUS_OPEN)
        assertThat(saved.captured.assignedOn).isEqualTo(today)
        assertThat(saved.captured.points).isEqualTo(10)
        assertThat(c.lastAssignedMemberId).isEqualTo(papa.id)
    }

    @Test
    fun `eine nicht faellige Vorlage taucht gar nicht erst auf`() {
        due()

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 0))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `eine Vorlage mit offener Zuweisung wird uebersprungen`() {
        val c = chore("Bad putzen")
        every {
            choreRepository.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
        } returns listOf(c)
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns true

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 0))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `ein leerer Pool laesst die Vorlage warten`() {
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(papa)
        due(chore("Zimmer aufräumen", group = GROUP_CHILDREN))

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 1))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `sind alle Poolmitglieder am Limit verfaellt nichts`() {
        every { assignmentRepository.countByMemberIdAndStatus(any(), STATUS_OPEN) } returns 5
        val c = chore("Staubsaugen")
        due(c)

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 1))
        assertThat(c.lastAssignedMemberId).isNull()
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `holt nach mehrtaegigem Ausfall alles Faellige nach`() {
        val alt = chore("Müll", due = LocalDate.of(2026, 9, 19))
        val neu = chore("Spülmaschine", due = LocalDate.of(2026, 9, 21))
        due(alt, neu)

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 2, waiting = 0))
        // Zwei Vorlagen, zwei verschiedene Mitglieder — der Zeiger rückt weiter.
        assertThat(alt.lastAssignedMemberId).isEqualTo(papa.id)
        assertThat(neu.lastAssignedMemberId).isEqualTo(anna.id)
    }

    @Test
    fun `gibt offene Zuweisungen inaktiver Mitglieder frei`() {
        val weg = UUID.randomUUID()
        val verwaist = ChoreAssignment(choreId = UUID.randomUUID(), memberId = weg, points = 10, assignedOn = today)
        val bleibt = ChoreAssignment(choreId = UUID.randomUUID(), memberId = papa.id!!, points = 10, assignedOn = today)
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns listOf(verwaist, bleibt)
        due()

        service.refillAll()

        verify { assignmentRepository.deleteAll(listOf(verwaist)) }
    }

    @Test
    fun `ohne verwaiste Zuweisungen wird nichts geloescht`() {
        val bleibt = ChoreAssignment(choreId = UUID.randomUUID(), memberId = anna.id!!, points = 10, assignedOn = today)
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns listOf(bleibt)
        due()

        service.refillAll()

        verify(exactly = 0) { assignmentRepository.deleteAll(any<List<ChoreAssignment>>()) }
    }

    @Test
    fun `verwaiste Zuweisung wird im selben Lauf an ein aktives Mitglied neu vergeben`() {
        // Schritt 0 muss VOR dem Ausgabelauf laufen: erst gibt die Freigabe die
        // Vorlage frei, dann kann derselbe Lauf sie neu vergeben. `released`
        // simuliert den DB-Zustand dynamisch — anders als ein statischer Stub
        // würde dieser Test fehlschlagen, wenn die beiden Schritte vertauscht wären.
        val weg = UUID.randomUUID()
        val c = chore("Klo putzen")
        val verwaist = ChoreAssignment(choreId = c.id!!, memberId = weg, points = 10, assignedOn = today)
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns listOf(verwaist)
        every {
            choreRepository.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
        } returns listOf(c)
        var released = false
        every { assignmentRepository.deleteAll(listOf(verwaist)) } answers { released = true }
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } answers { !released }

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 1, waiting = 0))
        assertThat(c.lastAssignedMemberId).isEqualTo(papa.id)
        verify { assignmentRepository.deleteAll(listOf(verwaist)) }
    }

    @Test
    fun `jede Vorlage laeuft in einer eigenen Transaktion`() {
        due(chore("A"), chore("B"))

        service.refillAll()

        verify(exactly = 2) { transactionTemplate.execute<Any>(any()) }
    }

    @Test
    fun `eine fehlschlagende Vorlage haelt die weiteren nicht auf`() {
        val kaputt = chore("Kaputte Vorlage", group = GROUP_PARENTS)
        val ok = chore("Laeuft weiter", group = GROUP_CHILDREN)
        due(kaputt, ok)
        every { choreRepository.save(kaputt) } throws RuntimeException("Speichern fehlgeschlagen")

        val result = service.refillAll()

        // Eine gescheiterte Vorlage zählt als "wartend": ihr nextDueOn hat sich
        // nicht verändert, sie bleibt fällig und kommt beim nächsten Lauf wieder dran.
        assertThat(result).isEqualTo(RefillResult(assigned = 1, waiting = 1))
        assertThat(ok.lastAssignedMemberId).isEqualTo(anna.id)
    }

    @Test
    fun `refillChore gibt eine einzelne Vorlage sofort aus`() {
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        val assigned = service.refillChore(c)

        assertThat(assigned).isTrue()
        assertThat(c.lastAssignedMemberId).isEqualTo(papa.id)
    }

    @Test
    fun `refillChore gibt false zurueck wenn niemand frei ist`() {
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns emptyList()
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        assertThat(service.refillChore(c)).isFalse()
    }

    @Test
    fun `refillChore gibt eine noch nicht faellige Vorlage nicht aus`() {
        // Pausieren + Reaktivieren einer gestern erledigten Wochenaufgabe darf
        // sie nicht sechs Tage zu früh ausgeben — Intervall ab letzter Erledigung.
        val c = chore("Tisch decken", due = today.plusDays(6))
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        assertThat(service.refillChore(c)).isFalse()
        verify(exactly = 0) { assignmentRepository.save(any()) }
        assertThat(c.lastAssignedMemberId).isNull()
    }

    @Test
    fun `refillChore gibt eine ueberfaellige Vorlage aus`() {
        val c = chore("Tisch decken", due = today.minusDays(3))
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        assertThat(service.refillChore(c)).isTrue()
    }

    @Test
    fun `refillChore gibt eine pausierte Vorlage nicht aus`() {
        val c = chore("Tisch decken").also { it.isActive = false }
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        assertThat(service.refillChore(c)).isFalse()
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `refillChore gibt false zurueck wenn die Vorlage schon offen ist`() {
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns true

        assertThat(service.refillChore(c)).isFalse()
    }
}
