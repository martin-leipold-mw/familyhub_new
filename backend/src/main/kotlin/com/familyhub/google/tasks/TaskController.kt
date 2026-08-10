package com.familyhub.google.tasks

import com.familyhub.generated.api.TasksApi
import com.familyhub.generated.model.ClearableTaskField
import com.familyhub.generated.model.CreateTaskRequest
import com.familyhub.generated.model.TaskResponse
import com.familyhub.generated.model.UpdateTaskRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class TaskController(
    private val service: TaskService,
) : TasksApi {
    override fun listTasks(memberId: UUID?): ResponseEntity<List<TaskResponse>> =
        ResponseEntity.ok(service.list(memberId).map { it.toResponse() })

    override fun createTask(createTaskRequest: CreateTaskRequest): ResponseEntity<TaskResponse> {
        val view =
            service.create(
                CreateTaskCommand(
                    memberId = createTaskRequest.memberId,
                    title = createTaskRequest.title,
                    notes = createTaskRequest.notes,
                    dueDate = createTaskRequest.dueDate,
                    priority = createTaskRequest.priority?.value,
                ),
            )
        return ResponseEntity.status(HttpStatus.CREATED).body(view.toResponse())
    }

    override fun updateTask(
        id: UUID,
        updateTaskRequest: UpdateTaskRequest,
    ): ResponseEntity<TaskResponse> {
        val clearFields = updateTaskRequest.clearFields ?: emptyList()
        val view =
            service.update(
                id,
                UpdateTaskCommand(
                    title = updateTaskRequest.title,
                    notes = updateTaskRequest.notes,
                    dueDate = updateTaskRequest.dueDate,
                    priority = updateTaskRequest.priority?.value,
                    status = updateTaskRequest.status?.value,
                    clearNotes = clearFields.contains(ClearableTaskField.NOTES),
                    clearDueDate = clearFields.contains(ClearableTaskField.DUE_DATE),
                    clearPriority = clearFields.contains(ClearableTaskField.PRIORITY),
                ),
            )
        return ResponseEntity.ok(view.toResponse())
    }

    override fun deleteTask(id: UUID): ResponseEntity<Unit> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }
}

private fun TaskView.toResponse() =
    TaskResponse(
        id = id,
        memberId = memberId,
        title = title,
        status = TaskResponse.Status.forValue(status),
        notes = notes,
        dueDate = dueDate,
        priority = priority?.let { TaskResponse.Priority.forValue(it) },
        completedAt = completedAt?.toString(),
    )
