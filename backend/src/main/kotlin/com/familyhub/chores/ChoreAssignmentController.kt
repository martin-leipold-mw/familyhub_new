package com.familyhub.chores

import com.familyhub.generated.api.ChoreAssignmentsApi
import com.familyhub.generated.model.ChoreAssignmentResponse
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Bewusst ohne PIN-Schutz: Abhaken ist die alltägliche Handlung am Wanddisplay,
 * und die Aktion trägt keinen Mitglieds-Parameter, über den sich fremde Punkte
 * gutschreiben ließen.
 */
@RestController
@RequestMapping("/api")
class ChoreAssignmentController(
    private val service: ChoreAssignmentService,
) : ChoreAssignmentsApi {
    override fun listChoreAssignments(): ResponseEntity<List<ChoreAssignmentResponse>> =
        ResponseEntity.ok(service.listCurrent().map { it.toResponse() })

    override fun completeChoreAssignment(id: UUID): ResponseEntity<ChoreAssignmentResponse> =
        ResponseEntity.ok(service.complete(id).toResponse())

    override fun undoChoreAssignment(id: UUID): ResponseEntity<ChoreAssignmentResponse> = ResponseEntity.ok(service.undo(id).toResponse())
}

private fun ChoreAssignmentView.toResponse() =
    ChoreAssignmentResponse(
        id = id,
        choreId = choreId,
        memberId = memberId,
        name = name,
        icon = icon,
        description = description,
        status = ChoreAssignmentResponse.Status.forValue(status),
        points = points,
        assignedOn = assignedOn,
        completedAt = completedAt?.toString(),
    )
