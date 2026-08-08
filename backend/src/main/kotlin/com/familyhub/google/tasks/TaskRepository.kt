package com.familyhub.google.tasks

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TaskRepository : JpaRepository<Task, UUID> {
    fun findAllByTaskListId(taskListId: UUID): List<Task>

    fun findByTaskListIdAndGoogleTaskId(
        taskListId: UUID,
        googleTaskId: String,
    ): Task?

    fun findAllByOwnerMemberId(ownerMemberId: UUID): List<Task>
}
