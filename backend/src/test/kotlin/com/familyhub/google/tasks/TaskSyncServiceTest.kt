package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.oauth.TASKS_SCOPE
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

class TaskSyncServiceTest {
    private val tasksClient = mockk<GoogleTasksClient>()
    private val taskListRepo = mockk<TaskListRepository>()
    private val taskRepo = mockk<TaskRepository>()
    private val connectionRepo = mockk<GoogleConnectionRepository>()
    private val mapper = TaskMapper()
    private val fixedNow = Instant.parse("2026-08-08T12:00:00Z")
    private val clock = Clock.fixed(fixedNow, ZoneOffset.UTC)

    private lateinit var service: TaskSyncService

    private val connectionId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()
    private val listId = UUID.randomUUID()

    private val connection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g123",
            email = "test@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            scopes = listOf(TASKS_SCOPE),
            status = "active",
            lastSyncedAt = null,
        ).also { it.id = connectionId }

    private val inactiveConnection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g456",
            email = "inactive@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            scopes = listOf(TASKS_SCOPE),
            status = "revoked",
            lastSyncedAt = null,
        ).also { it.id = UUID.randomUUID() }

    @BeforeEach
    fun setUp() {
        service =
            TaskSyncService(
                tasksClient = tasksClient,
                taskListRepo = taskListRepo,
                taskRepo = taskRepo,
                connectionRepo = connectionRepo,
                mapper = mapper,
                clock = clock,
            )
    }

    private fun task(
        googleTaskId: String,
        taskListId: UUID = listId,
        ownerMemberId: UUID = memberId,
        title: String = "Task $googleTaskId",
        priority: String? = null,
    ): Task =
        Task(
            taskListId = taskListId,
            googleTaskId = googleTaskId,
            ownerMemberId = ownerMemberId,
            title = title,
            priority = priority,
        ).also { it.id = UUID.randomUUID() }

    // ─── refreshTaskLists ──────────────────────────────────────────────────────

    @Test
    fun `refreshTaskLists inserts new lists as unselected`() {
        every { tasksClient.listTaskLists(connection) } returns
            listOf(GoogleTaskListInfo("list1", "Papa"), GoogleTaskListInfo("list2", "Mama"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns null
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list2") } returns null
        val saved = mutableListOf<TaskList>()
        every { taskListRepo.save(capture(saved)) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns emptyList()

        service.refreshTaskLists(connection)

        verify(exactly = 2) { taskListRepo.save(any()) }
        assertThat(saved).hasSize(2)
        assertThat(saved.map { it.googleTaskListId }).containsExactlyInAnyOrder("list1", "list2")
        assertThat(saved).allSatisfy { assertThat(it.isSelected).isFalse() }
    }

    @Test
    fun `refreshTaskLists updates the title and never touches isSelected`() {
        val existing =
            TaskList(
                connectionId = connectionId,
                googleTaskListId = "list1",
                title = "Alt",
                isSelected = true,
                isWriteTarget = true,
            ).also { it.id = listId }

        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Neuer Titel"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns existing
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(existing)

        service.refreshTaskLists(connection)

        assertThat(existing.title).isEqualTo("Neuer Titel")
        assertThat(existing.isSelected).isTrue()
        assertThat(existing.isWriteTarget).isTrue()
        verify(exactly = 1) { taskListRepo.save(existing) }
        verify(exactly = 0) { taskListRepo.delete(any()) }
    }

    @Test
    fun `refreshTaskLists deletes lists that vanished at google`() {
        val list1 =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = UUID.randomUUID() }
        val list2 =
            TaskList(connectionId = connectionId, googleTaskListId = "list2", title = "Mama", isSelected = false)
                .also { it.id = UUID.randomUUID() }

        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list1
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list1, list2)
        every { taskListRepo.delete(list2) } returns Unit

        service.refreshTaskLists(connection)

        verify(exactly = 1) { taskListRepo.delete(list2) }
        verify(exactly = 0) { taskListRepo.delete(list1) }
    }

    // ─── syncConnection: guards ────────────────────────────────────────────────

    @Test
    fun `syncConnection skips connections that are not active`() {
        val result = service.syncConnection(inactiveConnection)

        assertThat(result).isEqualTo(TaskSyncResult(0, 0, 0))
        verify(exactly = 0) { tasksClient.listTaskLists(any()) }
    }

    @Test
    fun `syncConnection skips connections without the tasks scope`() {
        val connectionWithoutScope =
            GoogleConnection(
                familyMemberId = memberId,
                credentialsId = null,
                googleAccountId = "g789",
                email = "noscope@example.com",
                accessToken = "enc_token",
                refreshToken = "enc_refresh",
                tokenExpiresAt = null,
                scopes = listOf("https://www.googleapis.com/auth/calendar"),
                status = "active",
                lastSyncedAt = null,
            ).also { it.id = UUID.randomUUID() }

        val result = service.syncConnection(connectionWithoutScope)

        assertThat(result).isEqualTo(TaskSyncResult(0, 0, 0))
        verify(exactly = 0) { tasksClient.listTaskLists(any()) }
    }

    // ─── syncConnection: list selection ────────────────────────────────────────

    @Test
    fun `syncConnection only syncs selected lists`() {
        val selected =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        val unselected =
            TaskList(connectionId = connectionId, googleTaskListId = "list2", title = "Mama", isSelected = false)
                .also { it.id = UUID.randomUUID() }

        every { tasksClient.listTaskLists(connection) } returns
            listOf(GoogleTaskListInfo("list1", "Papa"), GoogleTaskListInfo("list2", "Mama"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns selected
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list2") } returns unselected
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(selected, unselected)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(selected)
        every { tasksClient.listTasks(connection, "list1") } returns TaskPage(emptyList(), complete = true)
        every { taskRepo.findAllByTaskListId(listId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        service.syncConnection(connection)

        verify(exactly = 1) { tasksClient.listTasks(connection, "list1") }
        verify(exactly = 0) { tasksClient.listTasks(connection, "list2") }
    }

    // ─── syncConnection: task create/update/delete ─────────────────────────────

    @Test
    fun `syncConnection creates new tasks and counts them`() {
        val list =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)

        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("t1").setTitle("Milch")), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns null
        every { taskRepo.save(any()) } answers { firstArg() }
        every { taskRepo.findAllByTaskListId(listId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        assertThat(result).isEqualTo(TaskSyncResult(created = 1, updated = 0, deleted = 0))
        verify(exactly = 1) { taskRepo.save(any()) }
    }

    @Test
    fun `syncConnection updates known tasks and keeps the local priority`() {
        val list =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)

        val existing = task(googleTaskId = "t1", title = "Alt", priority = "high")
        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("t1").setTitle("Neu")), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns existing
        every { taskRepo.save(any()) } answers { firstArg() }
        every { taskRepo.findAllByTaskListId(listId) } returns listOf(existing)
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        assertThat(existing.title).isEqualTo("Neu")
        assertThat(existing.priority).isEqualTo("high")
        assertThat(result.updated).isEqualTo(1)
        assertThat(result.created).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(0)
    }

    @Test
    fun `syncConnection deletes tasks flagged deleted by google`() {
        val list =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)

        val existing = task(googleTaskId = "t1")
        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("t1").setDeleted(true)), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns existing
        every { taskRepo.delete(existing) } returns Unit
        every { taskRepo.findAllByTaskListId(listId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        verify(exactly = 1) { taskRepo.delete(existing) }
        assertThat(result.deleted).isEqualTo(1)
        assertThat(result.created).isEqualTo(0)
        assertThat(result.updated).isEqualTo(0)
    }

    // Zusätzlich zu den 13 benannten Tests aus dem Plan: schließt eine Verzweigung,
    // die für die geforderte 100%-Branchabdeckung (jacocoTestCoverageVerification)
    // sonst offen bliebe — ein von Google als gelöscht gemeldeter Task, der lokal
    // nie existierte, darf keinen delete()-Aufruf auslösen.
    @Test
    fun `syncConnection ignores a google-deleted task that has no local match`() {
        val list =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)

        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("ghost").setDeleted(true)), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "ghost") } returns null
        every { taskRepo.findAllByTaskListId(listId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        verify(exactly = 0) { taskRepo.delete(any()) }
        assertThat(result).isEqualTo(TaskSyncResult(created = 0, updated = 0, deleted = 0))
    }

    @Test
    fun `syncConnection deletes local tasks missing from a complete google page`() {
        val list =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = listId }
        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)

        val t1 = task(googleTaskId = "t1")
        val t2 = task(googleTaskId = "t2")
        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("t1").setTitle("Milch")), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns t1
        every { taskRepo.save(any()) } answers { firstArg() }
        every { taskRepo.findAllByTaskListId(listId) } returns listOf(t1, t2)
        every { taskRepo.delete(t2) } returns Unit
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        verify(exactly = 1) { taskRepo.delete(t2) }
        assertThat(result.deleted).isEqualTo(1)
        assertThat(result.updated).isEqualTo(1)
    }

    // ─── syncConnection: TA-GOO-17 — incomplete pagination must not delete ────

    @Test
    fun `syncConnection deletes nothing when pagination was incomplete`() {
        // TA-GOO-17: Das Altsystem las nur die erste Google-Seite und löschte danach
        // alles, was nicht darauf stand. Genau das darf hier nicht passieren.
        val list = TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
        list.id = listId
        val local1 = task(googleTaskId = "t1")
        val local2 = task(googleTaskId = "t2")

        every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)
        every { taskListRepo.save(any()) } answers { firstArg() }
        // Seite 2 ist weggebrochen: nur t1 gelesen, complete = false
        every { tasksClient.listTasks(connection, "list1") } returns
            TaskPage(listOf(GoogleTask().setId("t1").setTitle("Milch")), complete = false)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns local1
        every { taskRepo.findAllByTaskListId(listId) } returns listOf(local1, local2)
        every { taskRepo.save(any()) } answers { firstArg() }
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        // t2 steht nicht auf der gelesenen Seite — trotzdem wird es NICHT gelöscht.
        verify(exactly = 0) { taskRepo.delete(any()) }
        assertThat(result.deleted).isEqualTo(0)
        // Die gelesene Seite trägt trotzdem ihre Aktualisierung.
        assertThat(result.updated).isEqualTo(1)
    }

    // ─── syncConnection: connection bookkeeping ────────────────────────────────

    @Test
    fun `syncConnection updates lastSyncedAt on the connection`() {
        every { tasksClient.listTaskLists(connection) } returns emptyList()
        every { taskListRepo.findAllByConnectionId(connectionId) } returns emptyList()
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        service.syncConnection(connection)

        assertThat(connection.lastSyncedAt).isEqualTo(fixedNow)
        verify(exactly = 1) { connectionRepo.save(connection) }
    }

    // ─── syncConnection: resilience across lists ───────────────────────────────

    @Test
    fun `syncConnection continues with the next list when one fails`() {
        val list1 =
            TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
                .also { it.id = UUID.randomUUID() }
        val list2 =
            TaskList(connectionId = connectionId, googleTaskListId = "list2", title = "Mama", isSelected = true)
                .also { it.id = listId }

        every { tasksClient.listTaskLists(connection) } returns
            listOf(GoogleTaskListInfo("list1", "Papa"), GoogleTaskListInfo("list2", "Mama"))
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list1
        every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list2") } returns list2
        every { taskListRepo.save(any()) } answers { firstArg() }
        every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list1, list2)
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list1, list2)

        every { tasksClient.listTasks(connection, "list1") } throws RuntimeException("boom")
        every { tasksClient.listTasks(connection, "list2") } returns
            TaskPage(listOf(GoogleTask().setId("t2").setTitle("Brot")), complete = true)
        every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t2") } returns null
        every { taskRepo.save(any()) } answers { firstArg() }
        every { taskRepo.findAllByTaskListId(listId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        val result = service.syncConnection(connection)

        assertThat(result.created).isEqualTo(1)
        assertThat(result.updated).isEqualTo(0)
        assertThat(result.deleted).isEqualTo(0)
        verify(exactly = 1) { tasksClient.listTasks(connection, "list2") }
    }

    // ─── syncAll ─────────────────────────────────────────────────────────────

    @Test
    fun `syncAll syncs every active connection`() {
        every { connectionRepo.findAllByStatus("active") } returns listOf(connection)
        every { tasksClient.listTaskLists(connection) } returns emptyList()
        every { taskListRepo.findAllByConnectionId(connectionId) } returns emptyList()
        every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns emptyList()
        every { connectionRepo.save(any()) } answers { firstArg() }

        service.syncAll()

        verify(exactly = 1) { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) }
    }
}
