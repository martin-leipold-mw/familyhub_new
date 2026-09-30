package com.familyhub.chores

import com.familyhub.generated.api.ChoresApi
import com.familyhub.generated.model.ChoreOpenAssignmentResponse
import com.familyhub.generated.model.ChoreResponse
import com.familyhub.generated.model.ClearableChoreField
import com.familyhub.generated.model.CreateChoreRequest
import com.familyhub.generated.model.UpdateChoreRequest
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Konfigurierend = PIN-geschützt, alltäglich = offen — dieselbe Linie wie bei
 * Kalender und Aufgaben. Lesen bleibt frei, jeder schreibende Zugriff braucht
 * eine gültige PIN-Sitzung.
 */
@RestController
@RequestMapping("/api")
class ChoreController(
    private val service: ChoreService,
) : ChoresApi {
    override fun listChores(activeOnly: Boolean): ResponseEntity<List<ChoreResponse>> =
        ResponseEntity.ok(service.list(activeOnly).map { it.toResponse() })

    @RequiresPinSession
    override fun createChore(createChoreRequest: CreateChoreRequest): ResponseEntity<ChoreResponse> {
        val view =
            service.create(
                CreateChoreCommand(
                    name = createChoreRequest.name,
                    icon = createChoreRequest.icon,
                    description = createChoreRequest.description,
                    intervalDays = createChoreRequest.intervalDays,
                    assignmentGroup = createChoreRequest.assignmentGroup.value,
                    points = createChoreRequest.points ?: DEFAULT_POINTS,
                ),
            )
        return ResponseEntity.status(HttpStatus.CREATED).body(view.toResponse())
    }

    @RequiresPinSession
    override fun updateChore(
        id: UUID,
        updateChoreRequest: UpdateChoreRequest,
    ): ResponseEntity<ChoreResponse> {
        val clearFields = updateChoreRequest.clearFields ?: emptyList()
        val view =
            service.update(
                id,
                UpdateChoreCommand(
                    name = updateChoreRequest.name,
                    icon = updateChoreRequest.icon,
                    description = updateChoreRequest.description,
                    intervalDays = updateChoreRequest.intervalDays,
                    assignmentGroup = updateChoreRequest.assignmentGroup?.value,
                    points = updateChoreRequest.points,
                    isActive = updateChoreRequest.isActive,
                    clearDescription = clearFields.contains(ClearableChoreField.DESCRIPTION),
                ),
            )
        return ResponseEntity.ok(view.toResponse())
    }

    @RequiresPinSession
    override fun deleteChore(id: UUID): ResponseEntity<Unit> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }

    private companion object {
        const val DEFAULT_POINTS = 10
    }
}

private fun ChoreView.toResponse() =
    ChoreResponse(
        id = id,
        name = name,
        icon = icon,
        description = description,
        intervalDays = intervalDays,
        assignmentGroup = ChoreResponse.AssignmentGroup.forValue(assignmentGroup),
        points = points,
        isActive = isActive,
        nextDueOn = nextDueOn,
        openAssignment =
            openAssignment?.let {
                ChoreOpenAssignmentResponse(
                    id = it.id,
                    memberId = it.memberId,
                    memberName = it.memberName,
                    assignedOn = it.assignedOn,
                )
            },
    )
