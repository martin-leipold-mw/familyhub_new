package com.familyhub.chores

import com.familyhub.members.FamilyMemberRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.util.UUID

data class OpenAssignmentView(
    val id: UUID,
    val memberId: UUID,
    val memberName: String,
    val assignedOn: LocalDate,
)

data class ChoreView(
    val id: UUID,
    val name: String,
    val icon: String,
    val description: String?,
    val intervalDays: Int,
    val assignmentGroup: String,
    val points: Int,
    val isActive: Boolean,
    val nextDueOn: LocalDate,
    val openAssignment: OpenAssignmentView?,
)

data class CreateChoreCommand(
    val name: String,
    val icon: String,
    val description: String?,
    val intervalDays: Int,
    val assignmentGroup: String,
    val points: Int,
)

data class UpdateChoreCommand(
    val name: String?,
    val icon: String?,
    val description: String?,
    val intervalDays: Int?,
    val assignmentGroup: String?,
    val points: Int?,
    val isActive: Boolean?,
    val clearDescription: Boolean,
)

@Service
class ChoreService(
    private val choreRepository: ChoreRepository,
    private val assignmentRepository: ChoreAssignmentRepository,
    private val memberRepository: FamilyMemberRepository,
    private val refillService: ChoreRefillService,
    private val choreClock: ChoreClock,
) {
    fun list(activeOnly: Boolean): List<ChoreView> {
        val chores =
            if (activeOnly) {
                choreRepository.findAllByIsActiveTrueOrderByCreatedAtAsc()
            } else {
                choreRepository.findAllByOrderByCreatedAtAsc()
            }
        val open = chores.mapNotNull { assignmentRepository.findByChoreIdAndStatus(it.id!!, STATUS_OPEN) }
        val names = memberRepository.findAllById(open.map { it.memberId }).associate { it.id to it.name }
        val openByChore = open.associateBy { it.choreId }
        return chores.map { chore ->
            chore.toView(
                openByChore[chore.id]?.let {
                    OpenAssignmentView(
                        id = it.id!!,
                        memberId = it.memberId,
                        memberName = names.getValue(it.memberId),
                        assignedOn = it.assignedOn,
                    )
                },
            )
        }
    }

    @Transactional
    fun create(cmd: CreateChoreCommand): ChoreView {
        validate(cmd.name, cmd.icon, cmd.intervalDays, cmd.assignmentGroup, cmd.points)
        val chore =
            choreRepository.save(
                Chore(
                    name = cmd.name.trim(),
                    icon = cmd.icon.trim(),
                    description = cmd.description?.let { it.trim().ifBlank { null } },
                    intervalDays = cmd.intervalDays,
                    assignmentGroup = cmd.assignmentGroup,
                    points = cmd.points,
                    // Bei Anlage sofort fällig — die Vorlage soll unmittelbar in
                    // einer Lane auftauchen, nicht erst am nächsten Morgen.
                    nextDueOn = choreClock.today(),
                ),
            )
        refillService.refillChore(chore)
        return viewOf(chore)
    }

    @Transactional
    fun update(
        id: UUID,
        cmd: UpdateChoreCommand,
    ): ChoreView {
        val chore = load(id)
        val wasActive = chore.isActive
        validate(
            name = cmd.name ?: chore.name,
            icon = cmd.icon ?: chore.icon,
            intervalDays = cmd.intervalDays ?: chore.intervalDays,
            assignmentGroup = cmd.assignmentGroup ?: chore.assignmentGroup,
            points = cmd.points ?: chore.points,
        )
        apply(chore, cmd)
        choreRepository.save(chore)

        if (!wasActive && chore.isActive) refillService.refillChore(chore)
        // Eine pausierte Vorlage ist in der Familienansicht unsichtbar: ihre
        // offene Zuweisung verschwindet mit. Erledigte Zeilen sind Historie und bleiben.
        if (wasActive && !chore.isActive) {
            assignmentRepository.findByChoreIdAndStatus(id, STATUS_OPEN)?.let { assignmentRepository.delete(it) }
        }
        return viewOf(chore)
    }

    @Transactional
    fun delete(id: UUID) {
        load(id)
        // Das Altsystem löschte die Instanzhistorie per CASCADE mit, während die
        // gutgeschriebenen Punkte stehen blieben — Zeitraum-Ranglisten verloren
        // damit ihre Datenbasis. Hier wird stattdessen "Pausieren" angeboten.
        if (assignmentRepository.existsByChoreIdAndStatus(id, STATUS_COMPLETED)) {
            throw ValidationException(
                "Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren.",
            )
        }
        choreRepository.deleteById(id)
    }

    private fun apply(
        chore: Chore,
        cmd: UpdateChoreCommand,
    ) {
        cmd.name?.let { chore.name = it.trim() }
        cmd.icon?.let { chore.icon = it.trim() }
        cmd.intervalDays?.let { chore.intervalDays = it }
        cmd.assignmentGroup?.let { chore.assignmentGroup = it }
        cmd.points?.let { chore.points = it }
        cmd.isActive?.let { chore.isActive = it }
        // clearDescription gewinnt gegen description: ein PATCH ohne description
        // ist "unverändert", das Leeren muss daher ausdrücklich verlangt werden.
        if (cmd.clearDescription) chore.description = null else cmd.description?.let { chore.description = it.trim() }
    }

    private fun load(id: UUID): Chore =
        choreRepository.findById(id).orElseThrow { ResourceNotFoundException("Haushaltsaufgabe nicht gefunden") }

    private fun viewOf(chore: Chore): ChoreView =
        chore.toView(
            assignmentRepository.findByChoreIdAndStatus(chore.id!!, STATUS_OPEN)?.let {
                OpenAssignmentView(
                    id = it.id!!,
                    memberId = it.memberId,
                    memberName = memberRepository.findById(it.memberId).map { m -> m.name }.orElse(""),
                    assignedOn = it.assignedOn,
                )
            },
        )

    private fun validate(
        name: String,
        icon: String,
        intervalDays: Int,
        assignmentGroup: String,
        points: Int,
    ) {
        ensure(name.isNotBlank(), "Name darf nicht leer sein")
        ensure(icon.isNotBlank(), "Symbol darf nicht leer sein")
        ensure(intervalDays >= 1, "Intervall muss mindestens einen Tag betragen")
        ensure(assignmentGroup in ASSIGNMENT_GROUPS, "Unbekannte Zuweisungsgruppe")
        ensure(points >= 1, "Punkte müssen größer als null sein")
    }

    private fun ensure(
        valid: Boolean,
        message: String,
    ) {
        if (!valid) throw ValidationException(message)
    }
}

private fun Chore.toView(open: OpenAssignmentView?) =
    ChoreView(
        id = id!!,
        name = name,
        icon = icon,
        description = description,
        intervalDays = intervalDays,
        assignmentGroup = assignmentGroup,
        points = points,
        isActive = isActive,
        nextDueOn = nextDueOn,
        openAssignment = open,
    )
