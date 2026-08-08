package com.familyhub.google.tasks

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TaskListRepository : JpaRepository<TaskList, UUID> {
    fun findAllByConnectionId(connectionId: UUID): List<TaskList>

    fun findByConnectionIdAndGoogleTaskListId(
        connectionId: UUID,
        googleTaskListId: String,
    ): TaskList?

    fun findAllByConnectionIdAndIsSelectedTrue(connectionId: UUID): List<TaskList>
}
