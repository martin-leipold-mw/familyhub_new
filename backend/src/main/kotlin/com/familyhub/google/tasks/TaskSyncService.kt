package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.oauth.TASKS_SCOPE
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant

data class TaskSyncResult(
    val created: Int,
    val updated: Int,
    val deleted: Int,
)

@Service
class TaskSyncService(
    private val tasksClient: GoogleTasksClient,
    private val taskListRepo: TaskListRepository,
    private val taskRepo: TaskRepository,
    private val connectionRepo: GoogleConnectionRepository,
    private val mapper: TaskMapper,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Gleicht die Aufgabenlisten einer Verbindung mit Google ab.
     * Neue Listen kommen mit isSelected=false herein; bestehende werden nur im
     * Titel aktualisiert. Bei Google verschwundene Listen werden gelöscht — die
     * zugehörigen Aufgaben folgen per FK-CASCADE.
     * Eine leere (aber erfolgreiche) Antwort von Google löst KEINEN Löschabgleich
     * aus — sonst würde eine Liste mit z. B. leerem Google-Ergebnis alle lokalen
     * Listen samt Aufgaben, Prioritäten und Auswahl-Flags löschen.
     */
    fun refreshTaskLists(connection: GoogleConnection) {
        val connectionId = connection.id!!
        val remote = tasksClient.listTaskLists(connection)
        for (info in remote) {
            val existing = taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, info.id)
            if (existing == null) {
                taskListRepo.save(
                    TaskList(
                        connectionId = connectionId,
                        googleTaskListId = info.id,
                        title = info.title,
                        isSelected = false,
                    ),
                )
            } else {
                existing.title = info.title
                // isSelected und isWriteTarget werden NICHT verändert
                taskListRepo.save(existing)
            }
        }
        if (remote.isNotEmpty()) {
            val remoteIds = remote.map { it.id }.toSet()
            taskListRepo.findAllByConnectionId(connectionId)
                .filter { it.googleTaskListId !in remoteIds }
                .forEach { taskListRepo.delete(it) }
        } else {
            log.warn(
                "Keine Aufgabenlisten von Google für Verbindung {} — Löschabgleich übersprungen",
                connectionId,
            )
        }
    }

    fun syncConnection(connection: GoogleConnection): TaskSyncResult {
        if (connection.status != "active") {
            return TaskSyncResult(0, 0, 0)
        }
        if (TASKS_SCOPE !in connection.scopes) {
            log.warn(
                "Verbindung {} (Mitglied {}) hat den Tasks-Scope nicht — Aufgaben-Sync übersprungen",
                connection.id,
                connection.familyMemberId,
            )
            return TaskSyncResult(0, 0, 0)
        }

        refreshTaskLists(connection)

        var created = 0
        var updated = 0
        var deleted = 0
        for (list in taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connection.id!!)) {
            try {
                val result = syncTaskList(connection, list)
                created += result.created
                updated += result.updated
                deleted += result.deleted
            } catch (ex: Exception) {
                log.error("Aufgabenliste {} konnte nicht synchronisiert werden: {}", list.googleTaskListId, ex.message, ex)
            }
        }

        connection.lastSyncedAt = Instant.now(clock)
        connectionRepo.save(connection)

        return TaskSyncResult(created, updated, deleted)
    }

    private fun syncTaskList(
        connection: GoogleConnection,
        list: TaskList,
    ): TaskSyncResult {
        val listId = list.id!!
        val page = tasksClient.listTasks(connection, list.googleTaskListId)

        var created = 0
        var updated = 0
        var deleted = 0

        for (googleTask in page.tasks) {
            val existing = taskRepo.findByTaskListIdAndGoogleTaskId(listId, googleTask.id)
            if (mapper.isDeleted(googleTask)) {
                if (existing != null) {
                    taskRepo.delete(existing)
                    deleted++
                }
            } else if (existing == null) {
                taskRepo.save(mapper.toEntity(googleTask, listId, connection.familyMemberId))
                created++
            } else {
                mapper.applyGoogleFields(existing, googleTask)
                taskRepo.save(existing)
                updated++
            }
        }

        if (page.complete) {
            val seenIds = page.tasks.map { it.id }.toSet()
            taskRepo.findAllByTaskListId(listId)
                .filter { it.googleTaskId !in seenIds }
                .forEach {
                    taskRepo.delete(it)
                    deleted++
                }
        } else {
            // Wurzelbehebung TA-GOO-17: unvollständige Seite darf niemals löschen.
            log.error(
                "Aufgabenliste {} unvollständig geladen — Löschabgleich übersprungen",
                list.googleTaskListId,
            )
        }

        return TaskSyncResult(created, updated, deleted)
    }

    fun syncAll() {
        for (connection in connectionRepo.findAllByStatus("active")) {
            try {
                val result = syncConnection(connection)
                log.info(
                    "Aufgaben synchronisiert für Verbindung {} (Mitglied {}): created={}, updated={}, deleted={}",
                    connection.id,
                    connection.familyMemberId,
                    result.created,
                    result.updated,
                    result.deleted,
                )
            } catch (ex: Exception) {
                log.error(
                    "Aufgaben-Sync für Verbindung {} (Mitglied {}) fehlgeschlagen: {}",
                    connection.id,
                    connection.familyMemberId,
                    ex.message,
                    ex,
                )
            }
        }
    }
}
