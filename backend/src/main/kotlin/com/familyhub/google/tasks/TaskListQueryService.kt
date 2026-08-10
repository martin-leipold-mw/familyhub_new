package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.oauth.TASKS_SCOPE
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.slf4j.LoggerFactory
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
    private val log = LoggerFactory.getLogger(javaClass)

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
        if (TASKS_SCOPE in connection.scopes) {
            taskSyncService.refreshTaskLists(connection)
        } else {
            log.warn(
                "Verbindung {} (Mitglied {}) hat den Tasks-Scope nicht — Aufgabenlisten-Abgleich übersprungen",
                connection.id,
                connection.familyMemberId,
            )
        }
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
        // Der partielle Unique-Index idx_task_lists_write_target erlaubt nie zwei
        // gleichzeitige Ziellisten je Verbindung. Weder save()-Aufrufreihenfolge noch
        // Feldänderungsreihenfolge genügen dafür: die von findAllByConnectionId
        // gelieferten Listen sind bereits JPA-verwaltet, save() ist auf ihnen ein
        // No-Op, und Hibernates Dirty-Checking schreibt beim (einzigen, gemeinsamen)
        // Flush alle geänderten Zeilen in ihrer Registrierungsreihenfolge im
        // Persistence-Context — unabhängig davon, wann ihre Felder verändert oder
        // save() aufgerufen wurde. Deshalb wird hier explizit geflusht, nachdem eine
        // bisherige Zielliste gelöscht wurde und bevor die neue gesetzt wird: das
        // erzwingt die "Löschen"-UPDATE(s) sofort in der Datenbank, entkoppelt von
        // Hibernates Registrierungsreihenfolge, sodass zu keinem Zeitpunkt zwei
        // is_write_target = TRUE Zeilen gleichzeitig existieren.
        for (list in lists) {
            if (list !== target) {
                list.isWriteTarget = false
                taskListRepository.save(list)
            }
        }
        taskListRepository.flush()
        if (target != null) {
            target.isWriteTarget = true
            taskListRepository.save(target)
        }
    }

    fun syncForMember(memberId: UUID): TaskSyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return taskSyncService.syncConnection(connection)
    }
}
