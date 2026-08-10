package com.familyhub.google.tasks

import com.google.api.client.util.Data
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

@Component
class TaskMapper {
    fun toEntity(
        google: GoogleTask,
        taskListId: UUID,
        ownerMemberId: UUID,
    ): Task {
        val entity =
            Task(
                taskListId = taskListId,
                googleTaskId = google.id,
                ownerMemberId = ownerMemberId,
                title = google.title ?: "Ohne Titel",
            )
        applyGoogleFields(entity, google)
        return entity
    }

    /**
     * Überschreibt alle Felder, die Google besitzt ("Google gewinnt").
     * [Task.priority] bleibt unangetastet — sie ist rein lokal und hat keine
     * Google-Entsprechung.
     */
    fun applyGoogleFields(
        target: Task,
        google: GoogleTask,
    ) {
        target.title = google.title ?: "Ohne Titel"
        val trimmedNotes = google.notes?.trim()
        target.notes = if (trimmedNotes.isNullOrEmpty()) null else trimmedNotes
        target.dueDate = parseDueDate(google.due)
        target.status = if (google.status == "completed") "completed" else "pending"
        target.completedAt = parseInstant(google.completed)
        target.etag = google.etag
        target.googleUpdated = parseInstant(google.updated)
    }

    /**
     * Baut ein Teil-DTO für `tasks.patch` — nur nicht-null-Felder werden gesetzt.
     *
     * [clearNotes] / [clearDueDate] existieren, weil `null` in den übrigen Parametern
     * bereits "unverändert" bedeutet (siehe [TaskService.UpdateTaskCommand]) — es gibt sonst
     * keinen Weg, ein Google-Feld über PATCH explizit zu löschen. Ein Löschwunsch gewinnt
     * immer gegen einen gleichzeitig übergebenen Wert (siehe Kommentar unten).
     *
     * [Data.NULL_STRING] ist die vom google-api-client vorgesehene Markierung, um ein Feld
     * als JSON `null` zu serialisieren statt es (wie bei einem echten Kotlin-`null`) einfach
     * wegzulassen — nur so unterscheidet die Anfrage "unverändert" von "löschen".
     */
    fun toGoogleTask(
        title: String?,
        notes: String?,
        dueDate: LocalDate?,
        status: String?,
        clearNotes: Boolean = false,
        clearDueDate: Boolean = false,
    ): GoogleTask {
        val google = GoogleTask()
        title?.let { google.title = it }
        if (clearNotes) {
            google.notes = Data.NULL_STRING
        } else {
            notes?.let { google.notes = it }
        }
        if (clearDueDate) {
            google.due = Data.NULL_STRING
        } else {
            dueDate?.let { google.due = "${it}T00:00:00.000Z" }
        }
        status?.let { google.status = if (it == "completed") "completed" else "needsAction" }
        return google
    }

    fun isDeleted(google: GoogleTask): Boolean = google.deleted == true

    /**
     * Google liefert `due` als RFC-3339-Zeitstempel, dessen Uhrzeitanteil laut
     * Google-Dokumentation bedeutungslos ist — wir nehmen nur das Datum.
     * Unlesbare Werte werden zu `null`; das Altsystem setzte hier still `now()`.
     */
    private fun parseDueDate(due: String?): LocalDate? = due?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    private fun parseInstant(value: String?): Instant? = value?.let { runCatching { Instant.parse(it) }.getOrNull() }
}
