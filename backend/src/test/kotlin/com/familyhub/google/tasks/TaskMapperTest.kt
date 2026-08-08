package com.familyhub.google.tasks

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

class TaskMapperTest {
    private val mapper = TaskMapper()
    private val listId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    @Test
    fun `maps a google task to an entity`() {
        val google =
            GoogleTask()
                .setId("gt-1")
                .setTitle("Milch kaufen")
                .setNotes("2 Liter")
                .setDue("2026-08-12T00:00:00.000Z")
                .setStatus("needsAction")
                .setEtag("\"etag1\"")
                .setUpdated("2026-08-07T10:00:00.000Z")

        val entity = mapper.toEntity(google, listId, memberId)

        assertThat(entity.googleTaskId).isEqualTo("gt-1")
        assertThat(entity.taskListId).isEqualTo(listId)
        assertThat(entity.ownerMemberId).isEqualTo(memberId)
        assertThat(entity.title).isEqualTo("Milch kaufen")
        assertThat(entity.notes).isEqualTo("2 Liter")
        assertThat(entity.dueDate).isEqualTo(LocalDate.of(2026, 8, 12))
        assertThat(entity.status).isEqualTo("pending")
        assertThat(entity.completedAt).isNull()
        assertThat(entity.etag).isEqualTo("\"etag1\"")
    }

    @Test
    fun `maps google status completed and the completion timestamp`() {
        val google =
            GoogleTask()
                .setId("gt-2")
                .setTitle("Erledigt")
                .setStatus("completed")
                .setCompleted("2026-08-06T09:30:00.000Z")

        val entity = mapper.toEntity(google, listId, memberId)

        assertThat(entity.status).isEqualTo("completed")
        assertThat(entity.completedAt).isEqualTo(Instant.parse("2026-08-06T09:30:00Z"))
    }

    @Test
    fun `maps a missing title to Ohne Titel`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-3"), listId, memberId)
        assertThat(entity.title).isEqualTo("Ohne Titel")
    }

    @Test
    fun `maps a missing due date to null`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-4").setTitle("X"), listId, memberId)
        assertThat(entity.dueDate).isNull()
    }

    @Test
    fun `maps an unparsable due date to null instead of now`() {
        // Das Altsystem setzte hier still Instant.now() — ein Tippfehler erzeugte eine
        // Aufgabe mit Fälligkeit "jetzt". Wir lassen das Feld lieber leer.
        val entity = mapper.toEntity(GoogleTask().setId("gt-5").setTitle("X").setDue("kaputt"), listId, memberId)
        assertThat(entity.dueDate).isNull()
    }

    @Test
    fun `maps blank notes to null`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-6").setTitle("X").setNotes("   "), listId, memberId)
        assertThat(entity.notes).isNull()
    }

    @Test
    fun `applyGoogleFields overwrites google-owned fields but keeps the local priority`() {
        val existing =
            Task(
                taskListId = listId,
                googleTaskId = "gt-7",
                ownerMemberId = memberId,
                title = "Alt",
                notes = "alte Notiz",
                priority = "high",
            )

        mapper.applyGoogleFields(existing, GoogleTask().setId("gt-7").setTitle("Neu").setStatus("needsAction"))

        assertThat(existing.title).isEqualTo("Neu")
        assertThat(existing.notes).isNull()
        // priority ist rein lokal und überlebt jeden Sync
        assertThat(existing.priority).isEqualTo("high")
    }

    @Test
    fun `toGoogleTask sets only the provided fields`() {
        val google = mapper.toGoogleTask(title = null, notes = null, dueDate = null, status = "completed")

        assertThat(google.status).isEqualTo("completed")
        assertThat(google.title).isNull()
        assertThat(google.notes).isNull()
        assertThat(google.due).isNull()
    }

    @Test
    fun `toGoogleTask formats the due date as start of day UTC`() {
        val google =
            mapper.toGoogleTask(
                title = "Einkaufen",
                notes = "Liste",
                dueDate = LocalDate.of(2026, 8, 12),
                status = "needsAction",
            )

        assertThat(google.title).isEqualTo("Einkaufen")
        assertThat(google.notes).isEqualTo("Liste")
        assertThat(google.due).isEqualTo("2026-08-12T00:00:00.000Z")
    }

    @Test
    fun `isDeleted reports googles deleted flag`() {
        assertThat(mapper.isDeleted(GoogleTask().setDeleted(true))).isTrue()
        assertThat(mapper.isDeleted(GoogleTask().setDeleted(false))).isFalse()
        assertThat(mapper.isDeleted(GoogleTask())).isFalse()
    }

    // Zusätzlich zu den 10 Tests aus dem Plan: schließt Verzweigungen, die für die
    // geforderte 100%-Branchabdeckung (jacocoTestCoverageVerification) sonst offen
    // blieben — siehe Task-4-Report für die Begründung.

    @Test
    fun `toGoogleTask with all-null arguments leaves every google field untouched`() {
        val google = mapper.toGoogleTask(title = null, notes = null, dueDate = null, status = null)

        assertThat(google.title).isNull()
        assertThat(google.notes).isNull()
        assertThat(google.due).isNull()
        assertThat(google.status).isNull()
    }

    @Test
    fun `maps an unparsable completed timestamp to null instead of now`() {
        // Wie bei "due": ein kaputter Zeitstempel darf nicht still zu Instant.now() werden.
        val google =
            GoogleTask()
                .setId("gt-8")
                .setTitle("X")
                .setStatus("completed")
                .setCompleted("kaputt")

        val entity = mapper.toEntity(google, listId, memberId)

        assertThat(entity.completedAt).isNull()
    }
}
