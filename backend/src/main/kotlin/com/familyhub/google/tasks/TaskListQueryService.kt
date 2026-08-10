package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import java.util.UUID

data class TaskListView(
    val id: String,
    val title: String,
    val isSelected: Boolean,
    val isWriteTarget: Boolean,
    val memberId: UUID,
)

@Service
class TaskListQueryService(
    private val connectionRepository: GoogleConnectionRepository,
    private val taskListRepository: TaskListRepository,
    private val taskSyncService: TaskSyncService,
) {
    private fun TaskList.toView(memberId: UUID) =
        TaskListView(
            id = googleTaskListId,
            title = title,
            isSelected = isSelected,
            isWriteTarget = isWriteTarget,
            memberId = memberId,
        )

    fun listForMember(memberId: UUID): List<TaskListView> {
        val connection = connectionRepository.findByFamilyMemberId(memberId) ?: return emptyList()
        taskSyncService.refreshTaskLists(connection)
        return taskListRepository.findAllByConnectionId(connection.id!!)
            .map { it.toView(connection.familyMemberId) }
    }

    fun listAll(): List<TaskListView> =
        connectionRepository.findAllByStatus("active").flatMap { connection ->
            taskListRepository.findAllByConnectionId(connection.id!!)
                .map { it.toView(connection.familyMemberId) }
        }

    fun saveSelection(
        memberId: UUID,
        taskListIds: List<String>,
        writeTargetId: String?,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val lists = taskListRepository.findAllByConnectionId(connection.id!!)
        for (list in lists) {
            list.isSelected = list.googleTaskListId in taskListIds
        }
        // Eine nicht ausgewählte Liste kann niemals Zielliste sein.
        val target = lists.firstOrNull { it.isSelected && it.googleTaskListId == writeTargetId }
        for (list in lists) {
            list.isWriteTarget = list === target
        }
        // Der partielle Unique-Index idx_task_lists_write_target erlaubt nie zwei
        // gleichzeitige Ziellisten je Verbindung: erst alle anderen Listen speichern
        // (inkl. dem Löschen einer bisherigen Zielliste), erst danach die neue
        // Zielliste setzen — sonst würde ein Zwischenzustand mit zwei
        // is_write_target = TRUE den Index verletzen.
        lists.filter { it !== target }.forEach { taskListRepository.save(it) }
        target?.let { taskListRepository.save(it) }
    }

    fun syncForMember(memberId: UUID): TaskSyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return taskSyncService.syncConnection(connection)
    }
}
