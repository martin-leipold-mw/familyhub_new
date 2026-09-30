package com.familyhub.chores

import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

const val UNDO_WINDOW_SECONDS = 300L

data class ChoreAssignmentView(
    val id: UUID,
    val choreId: UUID,
    val memberId: UUID,
    val name: String,
    val icon: String,
    val description: String?,
    val status: String,
    val points: Int,
    val assignedOn: LocalDate,
    val completedAt: Instant?,
)

/**
 * Abhaken ist offen und ohne PIN — es ist eine alltägliche Handlung am
 * Wanddisplay. Verbucht wird immer auf `assignment.memberId`; es gibt bewusst
 * keinen Mitglieds-Parameter, also auch keine Möglichkeit, fremde Punkte
 * gutzuschreiben.
 */
@Service
class ChoreAssignmentService(
    private val assignmentRepository: ChoreAssignmentRepository,
    private val choreRepository: ChoreRepository,
    private val choreClock: ChoreClock,
) {
    /** Offene Zuweisungen plus die heute erledigten (Haushaltszeitzone). */
    fun listCurrent(): List<ChoreAssignmentView> {
        val assignments =
            assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(
                STATUS_OPEN,
                choreClock.startOfToday(),
            )
        val chores = choreRepository.findAllById(assignments.map { it.choreId }).associateBy { it.id }
        return assignments.map { it.toView(chores.getValue(it.choreId)) }
    }

    @Transactional
    fun complete(id: UUID): ChoreAssignmentView {
        val assignment = load(id)
        val chore = loadChore(assignment.choreId)
        if (assignment.status == STATUS_COMPLETED) return assignment.toView(chore)

        assignment.status = STATUS_COMPLETED
        assignment.completedAt = choreClock.now()
        assignmentRepository.save(assignment)

        // Erst die Erledigung startet das Intervall neu — nicht die Ausgabe.
        chore.nextDueOn = choreClock.today().plusDays(chore.intervalDays.toLong())
        choreRepository.save(chore)
        return assignment.toView(chore)
    }

    @Transactional
    fun undo(id: UUID): ChoreAssignmentView {
        val assignment = load(id)
        val chore = loadChore(assignment.choreId)
        if (assignment.status != STATUS_COMPLETED) return assignment.toView(chore)

        val deadline = choreClock.now().minusSeconds(UNDO_WINDOW_SECONDS)
        if (assignment.completedAt!!.isBefore(deadline)) {
            throw ValidationException("Rückgängig ist nur innerhalb von 5 Minuten möglich.")
        }
        assignment.status = STATUS_OPEN
        assignment.completedAt = null
        assignmentRepository.save(assignment)
        return assignment.toView(chore)
    }

    private fun load(id: UUID): ChoreAssignment =
        assignmentRepository.findById(id).orElseThrow { ResourceNotFoundException("Zuweisung nicht gefunden") }

    private fun loadChore(id: UUID): Chore =
        choreRepository.findById(id).orElseThrow { ResourceNotFoundException("Haushaltsaufgabe nicht gefunden") }
}

private fun ChoreAssignment.toView(chore: Chore) =
    ChoreAssignmentView(
        id = id!!,
        choreId = choreId,
        memberId = memberId,
        name = chore.name,
        icon = chore.icon,
        description = chore.description,
        status = status,
        points = points,
        assignedOn = assignedOn,
        completedAt = completedAt,
    )
