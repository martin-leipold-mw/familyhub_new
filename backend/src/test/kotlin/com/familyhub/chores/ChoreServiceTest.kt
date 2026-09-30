package com.familyhub.chores

import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class ChoreServiceTest {
    private val choreRepository = mockk<ChoreRepository>()
    private val assignmentRepository = mockk<ChoreAssignmentRepository>()
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val refillService = mockk<ChoreRefillService>(relaxed = true)
    private val choreClock = mockk<ChoreClock>()

    private val today = LocalDate.of(2026, 9, 22)
    private val choreId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    private lateinit var service: ChoreService

    private fun chore(
        name: String = "Toilette putzen",
        active: Boolean = true,
        due: LocalDate = today,
    ) = Chore(
        name = name,
        icon = "🚽",
        description = "Auch den Spiegel!",
        intervalDays = 7,
        assignmentGroup = GROUP_ALL,
        points = 10,
        isActive = active,
        nextDueOn = due,
    ).also { it.id = choreId }

    private fun validCreate() =
        CreateChoreCommand(
            name = "Toilette putzen",
            icon = "🚽",
            description = null,
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            points = 10,
        )

    private fun emptyUpdate() =
        UpdateChoreCommand(
            name = null,
            icon = null,
            description = null,
            intervalDays = null,
            assignmentGroup = null,
            points = null,
            isActive = null,
            clearDescription = false,
        )

    @BeforeEach
    fun setUp() {
        every { choreClock.today() } returns today
        every { choreRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.findByChoreIdAndStatus(any(), STATUS_OPEN) } returns null
        every { memberRepository.findAllById(any()) } returns emptyList()
        service = ChoreService(choreRepository, assignmentRepository, memberRepository, refillService, choreClock)
    }

    // ─── list ─────────────────────────────────────────────────────────────────

    @Test
    fun `list liefert alle Vorlagen inklusive pausierter`() {
        every { choreRepository.findAllByOrderByCreatedAtAsc() } returns listOf(chore(active = false))

        val views = service.list(activeOnly = false)

        assertThat(views).hasSize(1)
        assertThat(views[0].isActive).isFalse()
        assertThat(views[0].nextDueOn).isEqualTo(today)
        assertThat(views[0].openAssignment).isNull()
    }

    @Test
    fun `list mit activeOnly liefert nur aktive Vorlagen`() {
        every { choreRepository.findAllByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(chore())

        val views = service.list(activeOnly = true)

        assertThat(views).hasSize(1)
        verify(exactly = 0) { choreRepository.findAllByOrderByCreatedAtAsc() }
    }

    @Test
    fun `list traegt die offene Zuweisung samt Mitgliedsnamen auf`() {
        val assignmentId = UUID.randomUUID()
        every { choreRepository.findAllByOrderByCreatedAtAsc() } returns listOf(chore())
        every { assignmentRepository.findByChoreIdAndStatus(choreId, STATUS_OPEN) } returns
            ChoreAssignment(choreId = choreId, memberId = memberId, points = 10, assignedOn = today)
                .also { it.id = assignmentId }
        every { memberRepository.findAllById(listOf(memberId)) } returns
            listOf(FamilyMember(name = "Anna", role = "child", color = "pink").also { it.id = memberId })

        val open = service.list(activeOnly = false)[0].openAssignment

        assertThat(open).isNotNull
        assertThat(open!!.id).isEqualTo(assignmentId)
        assertThat(open.memberId).isEqualTo(memberId)
        assertThat(open.memberName).isEqualTo("Anna")
        assertThat(open.assignedOn).isEqualTo(today)
    }

    // ─── create ───────────────────────────────────────────────────────────────

    @Test
    fun `create setzt nextDueOn auf heute und gibt sofort aus`() {
        val saved = slotChore()

        val view = service.create(validCreate())

        assertThat(view.nextDueOn).isEqualTo(today)
        assertThat(view.isActive).isTrue()
        verify { refillService.refillChore(saved()) }
    }

    @Test
    fun `create lehnt einen leeren Namen ab`() {
        assertThatThrownBy { service.create(validCreate().copy(name = "   ")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Name darf nicht leer sein")
    }

    @Test
    fun `create lehnt ein leeres Emoji ab`() {
        assertThatThrownBy { service.create(validCreate().copy(icon = "")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Symbol darf nicht leer sein")
    }

    @Test
    fun `create lehnt ein Intervall von null Tagen ab`() {
        assertThatThrownBy { service.create(validCreate().copy(intervalDays = 0)) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Intervall muss mindestens einen Tag betragen")
    }

    @Test
    fun `create lehnt eine unbekannte Zuweisungsgruppe ab`() {
        assertThatThrownBy { service.create(validCreate().copy(assignmentGroup = "grandparents")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Unbekannte Zuweisungsgruppe")
    }

    @Test
    fun `create lehnt nicht positive Punkte ab`() {
        assertThatThrownBy { service.create(validCreate().copy(points = 0)) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Punkte müssen größer als null sein")
    }

    // ─── update ───────────────────────────────────────────────────────────────

    @Test
    fun `update aendert nur die uebergebenen Felder`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(name = "Bad putzen", points = 20))

        assertThat(c.name).isEqualTo("Bad putzen")
        assertThat(c.points).isEqualTo(20)
        assertThat(c.icon).isEqualTo("🚽")
        assertThat(c.intervalDays).isEqualTo(7)
        assertThat(c.description).isEqualTo("Auch den Spiegel!")
    }

    @Test
    fun `update kann alle uebrigen Felder setzen`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(
            choreId,
            emptyUpdate().copy(icon = "🛁", description = "Neu", intervalDays = 14, assignmentGroup = GROUP_CHILDREN),
        )

        assertThat(c.icon).isEqualTo("🛁")
        assertThat(c.description).isEqualTo("Neu")
        assertThat(c.intervalDays).isEqualTo(14)
        assertThat(c.assignmentGroup).isEqualTo(GROUP_CHILDREN)
    }

    @Test
    fun `update kann die Beschreibung ausdruecklich leeren`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(clearDescription = true))

        assertThat(c.description).isNull()
    }

    @Test
    fun `Reaktivieren gibt die Vorlage sofort aus`() {
        val c = chore(active = false)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = true))

        assertThat(c.isActive).isTrue()
        verify { refillService.refillChore(c) }
    }

    @Test
    fun `Pausieren gibt nichts aus`() {
        val c = chore(active = true)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = false))

        assertThat(c.isActive).isFalse()
        verify(exactly = 0) { refillService.refillChore(any()) }
    }

    @Test
    fun `eine bereits aktive Vorlage wird durch isActive true nicht neu ausgegeben`() {
        val c = chore(active = true)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = true))

        verify(exactly = 0) { refillService.refillChore(any()) }
    }

    @Test
    fun `update validiert die neuen Werte`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThatThrownBy { service.update(choreId, emptyUpdate().copy(intervalDays = -1)) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update einer unbekannten Vorlage ergibt 404`() {
        every { choreRepository.findById(choreId) } returns Optional.empty()

        assertThatThrownBy { service.update(choreId, emptyUpdate()) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    @Test
    fun `create trimmt die Beschreibung und macht Leerraum zu null`() {
        val saved = slotChore()

        service.create(validCreate().copy(description = "  Mit Spiegel  "))
        assertThat(saved().description).isEqualTo("Mit Spiegel")

        service.create(validCreate().copy(description = "  "))
        assertThat(saved().description).isNull()
    }

    @Test
    fun `update ersetzt die Beschreibung ohne clearDescription`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(description = " Neu ", clearDescription = false))

        assertThat(c.description).isEqualTo("Neu")
    }

    @Test
    fun `eine pausierte Vorlage bleibt bei anderen Aenderungen pausiert und wird nicht ausgegeben`() {
        val c = chore(active = false)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(name = "Bad"))

        assertThat(c.isActive).isFalse()
        verify(exactly = 0) { refillService.refillChore(any()) }
    }

    @Test
    fun `update liefert die offene Zuweisung samt Mitgliedsnamen`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)
        every { assignmentRepository.findByChoreIdAndStatus(choreId, STATUS_OPEN) } returns
            ChoreAssignment(choreId = choreId, memberId = memberId, points = 10, assignedOn = today)
                .also { it.id = UUID.randomUUID() }
        every { memberRepository.findById(memberId) } returns
            Optional.of(FamilyMember(name = "Anna", role = "child", color = "pink").also { it.id = memberId })

        val open = service.update(choreId, emptyUpdate()).openAssignment

        assertThat(open!!.memberName).isEqualTo("Anna")
        assertThat(open.memberId).isEqualTo(memberId)
    }

    // ─── delete ───────────────────────────────────────────────────────────────

    @Test
    fun `delete entfernt eine Vorlage ohne erledigte Historie`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())
        every { assignmentRepository.existsByChoreIdAndStatus(choreId, STATUS_COMPLETED) } returns false
        every { choreRepository.deleteById(choreId) } returns Unit

        service.delete(choreId)

        verify { choreRepository.deleteById(choreId) }
    }

    @Test
    fun `delete lehnt eine Vorlage mit erledigter Historie ab`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())
        every { assignmentRepository.existsByChoreIdAndStatus(choreId, STATUS_COMPLETED) } returns true

        assertThatThrownBy { service.delete(choreId) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren.")
        verify(exactly = 0) { choreRepository.deleteById(any()) }
    }

    @Test
    fun `delete einer unbekannten Vorlage ergibt 404`() {
        every { choreRepository.findById(choreId) } returns Optional.empty()

        assertThatThrownBy { service.delete(choreId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    // Hilfsfunktion: fängt die gespeicherte Vorlage ein, damit der Test prüfen
    // kann, dass genau sie an die Sofortausgabe weitergereicht wird.
    private fun slotChore(): () -> Chore {
        var captured: Chore? = null
        every { choreRepository.save(any()) } answers {
            // Wie JPA beim echten save(): die Id wird vergeben.
            captured = firstArg<Chore>().also { it.id = choreId }
            captured
        }
        return { captured!! }
    }
}
