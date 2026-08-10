package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

/** Erledigte Aufgaben, die älter sind, werden nicht mehr ausgeliefert. */
const val COMPLETED_RETENTION_DAYS = 30L

data class TaskView(
    val id: UUID,
    val memberId: UUID,
    val title: String,
    val notes: String?,
    val dueDate: LocalDate?,
    val status: String,
    val priority: String?,
    val completedAt: Instant?,
)

data class CreateTaskCommand(
    val memberId: UUID,
    val title: String,
    val notes: String?,
    val dueDate: LocalDate?,
    val priority: String?,
)

data class UpdateTaskCommand(
    val title: String?,
    val notes: String?,
    val dueDate: LocalDate?,
    val priority: String?,
    val status: String?,
)

/**
 * Schreibpfad für Aufgaben: Google ist die Quelle der Wahrheit, es gibt keinen zweiten
 * Zustandsraum. Jede Schreiboperation geht deshalb zuerst an Google — scheitert der
 * Google-Aufruf, bleibt die lokale DB unverändert (siehe [EventService] in
 * `google.calendar` für dasselbe Muster im Kalender).
 */
@Service
class TaskService(
    private val taskRepository: TaskRepository,
    private val taskListRepository: TaskListRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val tasksClient: GoogleTasksClient,
    private val mapper: TaskMapper,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun list(memberId: UUID?): List<TaskView> {
        val cutoff = Instant.now(clock).minus(COMPLETED_RETENTION_DAYS, ChronoUnit.DAYS)
        val all = if (memberId == null) taskRepository.findAll() else taskRepository.findAllByOwnerMemberId(memberId)
        return all
            .filter { it.status == "pending" || isRecent(it.completedAt, cutoff) }
            .sortedWith(compareBy<Task> { it.dueDate ?: LocalDate.MAX }.thenBy { it.title })
            .map { it.toView() }
    }

    fun create(cmd: CreateTaskCommand): TaskView {
        val connection = requireConnection(cmd.memberId)
        val target = requireWriteTarget(connection)
        val googleTask = mapper.toGoogleTask(cmd.title, cmd.notes, cmd.dueDate, "pending")
        val inserted = tasksClient.insertTask(connection, target.googleTaskListId, googleTask)
        val entity = mapper.toEntity(inserted, target.id!!, cmd.memberId)
        entity.priority = cmd.priority
        return taskRepository.save(entity).toView()
    }

    fun update(
        id: UUID,
        cmd: UpdateTaskCommand,
    ): TaskView {
        val local = requireTask(id)
        // priority ist rein lokal — eine Änderung nur daran erreicht Google nie.
        if (cmd.touchesGoogleFields()) {
            val connection = requireConnection(local.ownerMemberId)
            val list = requireList(local.taskListId)
            val patch = mapper.toGoogleTask(cmd.title, cmd.notes, cmd.dueDate, cmd.status)
            val patched = tasksClient.patchTask(connection, list.googleTaskListId, local.googleTaskId, patch)
            mapper.applyGoogleFields(local, patched)
        }
        if (cmd.priority != null) local.priority = cmd.priority
        return taskRepository.save(local).toView()
    }

    fun delete(id: UUID) {
        val local = requireTask(id)
        val connection = requireConnection(local.ownerMemberId)
        val list = requireList(local.taskListId)
        tasksClient.deleteTask(connection, list.googleTaskListId, local.googleTaskId)
        taskRepository.delete(local)
    }

    /** Ob mindestens ein bei Google gepflegtes Feld geändert wurde (priority zählt nicht — die ist rein lokal). */
    private fun UpdateTaskCommand.touchesGoogleFields(): Boolean = listOfNotNull(title, notes, dueDate, status).isNotEmpty()

    private fun isRecent(
        completedAt: Instant?,
        cutoff: Instant,
    ): Boolean = completedAt != null && completedAt.isAfter(cutoff)

    private fun requireTask(id: UUID) = taskRepository.findById(id).orElseThrow { ResourceNotFoundException("Aufgabe nicht gefunden") }

    private fun requireConnection(memberId: UUID): GoogleConnection =
        connectionRepository.findByFamilyMemberId(memberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

    private fun requireList(taskListId: UUID) =
        taskListRepository.findById(taskListId).orElseThrow {
            ResourceNotFoundException("Aufgabenliste nicht gefunden")
        }

    private fun requireWriteTarget(connection: GoogleConnection): TaskList {
        val lists = taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connection.id!!)
        return lists.firstOrNull { it.isWriteTarget }
            ?: lists.firstOrNull()
            ?: throw ValidationException("Keine Ziel-Aufgabenliste vorhanden")
    }

    private fun Task.toView() =
        TaskView(
            id = id!!,
            memberId = ownerMemberId,
            title = title,
            notes = notes,
            dueDate = dueDate,
            status = status,
            priority = priority,
            completedAt = completedAt,
        )
}
