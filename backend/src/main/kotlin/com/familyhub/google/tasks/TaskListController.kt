package com.familyhub.google.tasks

import com.familyhub.generated.api.GoogleTaskListsApi
import com.familyhub.generated.model.SelectedTaskListsRequest
import com.familyhub.generated.model.SyncResultResponse
import com.familyhub.generated.model.TaskListResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class TaskListController(
    private val service: TaskListQueryService,
) : GoogleTaskListsApi {
    override fun listTaskLists(memberId: UUID?): ResponseEntity<List<TaskListResponse>> {
        val views = if (memberId == null) service.listAll() else service.listForMember(memberId)
        return ResponseEntity.ok(views.map { it.toResponse() })
    }

    @RequiresPinSession
    override fun saveSelectedTaskLists(selectedTaskListsRequest: SelectedTaskListsRequest): ResponseEntity<Unit> {
        service.saveSelection(
            memberId = selectedTaskListsRequest.memberId,
            taskListIds = selectedTaskListsRequest.taskListIds,
            writeTargetId = selectedTaskListsRequest.writeTargetId,
        )
        return ResponseEntity.ok().build()
    }

    override fun syncTaskLists(memberId: UUID): ResponseEntity<SyncResultResponse> {
        val r = service.syncForMember(memberId)
        return ResponseEntity.ok(SyncResultResponse(created = r.created, updated = r.updated, deleted = r.deleted))
    }
}

private fun TaskListView.toResponse() =
    TaskListResponse(
        id = id,
        title = title,
        isSelected = isSelected,
        isWriteTarget = isWriteTarget,
        memberId = memberId,
    )
