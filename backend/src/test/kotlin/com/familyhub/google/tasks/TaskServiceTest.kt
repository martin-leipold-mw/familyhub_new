package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import io.mockk.verifyOrder
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Optional
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

class TaskServiceTest {
    // ─── Mocks ────────────────────────────────────────────────────────────────

    private val taskRepository = mockk<TaskRepository>()
    private val taskListRepository = mockk<TaskListRepository>()
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val tasksClient = mockk<GoogleTasksClient>()
    private val mapper = TaskMapper()

    private val fixedNow = Instant.parse("2026-08-10T12:00:00Z")
    private val clock = Clock.fixed(fixedNow, ZoneOffset.UTC)

    private lateinit var service: TaskService

    // ─── Fixed test data ──────────────────────────────────────────────────────

    private val memberId = UUID.randomUUID()
    private val connectionId = UUID.randomUUID()
    private val taskListId = UUID.randomUUID()
    private val taskId = UUID.randomUUID()

    private val connection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g123",
            email = "test@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            status = "active",
        ).also { it.id = connectionId }

    private val writeTargetList =
        TaskList(
            connectionId = connectionId,
            googleTaskListId = "glist-write",
            title = "Zielliste",
            isSelected = true,
            isWriteTarget = true,
        ).also { it.id = taskListId }

    @BeforeEach
    fun setUp() {
        service =
            TaskService(
                taskRepository = taskRepository,
                taskListRepository = taskListRepository,
                connectionRepository = connectionRepository,
                tasksClient = tasksClient,
                mapper = mapper,
                clock = clock,
            )
    }

    private fun task(
        id: UUID = UUID.randomUUID(),
        title: String,
        dueDate: LocalDate? = null,
        status: String = "pending",
        completedAt: Instant? = null,
        priority: String? = null,
        listId: UUID = taskListId,
        owner: UUID = memberId,
        googleTaskId: String = "g-$id",
    ) = Task(
        taskListId = listId,
        googleTaskId = googleTaskId,
        ownerMemberId = owner,
        title = title,
        dueDate = dueDate,
        status = status,
        completedAt = completedAt,
        priority = priority,
    ).also { it.id = id }

    // ─── list ─────────────────────────────────────────────────────────────────

    @Test
    fun `list returns pending tasks and recently completed ones`() {
        val pending = task(title = "Offen")
        val recentlyCompleted = task(title = "Erledigt vor 5 Tagen", status = "completed", completedAt = fixedNow.minusSeconds(5 * 86400))
        val longCompleted = task(title = "Erledigt vor 40 Tagen", status = "completed", completedAt = fixedNow.minusSeconds(40 * 86400))
        every { taskRepository.findAll() } returns listOf(pending, recentlyCompleted, longCompleted)

        val result = service.list(memberId = null)

        assertThat(result.map { it.title }).containsExactlyInAnyOrder("Offen", "Erledigt vor 5 Tagen")
    }

    @Test
    fun `list excludes a completed task without a completedAt timestamp`() {
        // Verteidigend: sollte laut Datenmodell nicht vorkommen, aber isRecent muss den
        // Fall completedAt == null sicher als "nicht aktuell" behandeln (nicht NPEen).
        val malformed = task(title = "Ohne Zeitstempel", status = "completed", completedAt = null)
        every { taskRepository.findAll() } returns listOf(malformed)

        val result = service.list(memberId = null)

        assertThat(result).isEmpty()
    }

    @Test
    fun `list filters by member when a memberId is given`() {
        val theirs = task(title = "Meins", owner = memberId)
        every { taskRepository.findAllByOwnerMemberId(memberId) } returns listOf(theirs)

        val result = service.list(memberId = memberId)

        assertThat(result).hasSize(1)
        assertThat(result[0].memberId).isEqualTo(memberId)
        verify(exactly = 1) { taskRepository.findAllByOwnerMemberId(memberId) }
        verify(exactly = 0) { taskRepository.findAll() }
    }

    @Test
    fun `list sorts by due date with undated tasks last and ties by title`() {
        val zebra = task(title = "Zebra", dueDate = LocalDate.of(2026, 8, 20))
        val middle = task(title = "Middle", dueDate = LocalDate.of(2026, 8, 10))
        val alpha = task(title = "Alpha", dueDate = LocalDate.of(2026, 8, 10))
        val undated = task(title = "Apple", dueDate = null)
        every { taskRepository.findAll() } returns listOf(zebra, middle, alpha, undated)

        val result = service.list(memberId = null)

        assertThat(result.map { it.title }).containsExactly("Alpha", "Middle", "Zebra", "Apple")
    }

    // ─── create ───────────────────────────────────────────────────────────────

    @Test
    fun `create pushes to google before saving locally`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(writeTargetList)
        val inserted = GoogleTask().setId("g-new").setTitle("Milch kaufen")
        every { tasksClient.insertTask(connection, "glist-write", any()) } returns inserted
        every { taskRepository.save(any<Task>()) } answers { firstArg<Task>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateTaskCommand(memberId = memberId, title = "Milch kaufen", notes = null, dueDate = null, priority = null)
        val result = service.create(cmd)

        assertThat(result.title).isEqualTo("Milch kaufen")
        assertThat(result.memberId).isEqualTo(memberId)
        verifyOrder {
            tasksClient.insertTask(connection, "glist-write", any())
            taskRepository.save(any<Task>())
        }
    }

    @Test
    fun `create sets the local-only priority on the saved entity`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(writeTargetList)
        every { tasksClient.insertTask(connection, "glist-write", any()) } returns GoogleTask().setId("g-new").setTitle("X")
        val savedSlot = slot<Task>()
        every { taskRepository.save(capture(savedSlot)) } answers { firstArg<Task>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = "high")
        val result = service.create(cmd)

        assertThat(savedSlot.captured.priority).isEqualTo("high")
        assertThat(result.priority).isEqualTo("high")
        // priority is local-only: never sent to Google.
        verify(exactly = 1) { tasksClient.insertTask(connection, "glist-write", withArg { assertThat(it.notes).isNull() }) }
    }

    @Test
    fun `create uses the write target list`() {
        val otherSelected =
            TaskList(connectionId = connectionId, googleTaskListId = "glist-other", title = "Andere", isSelected = true)
                .also { it.id = UUID.randomUUID() }
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(otherSelected, writeTargetList)
        every { tasksClient.insertTask(connection, "glist-write", any()) } returns GoogleTask().setId("g-new").setTitle("X")
        every { taskRepository.save(any<Task>()) } answers { firstArg<Task>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = null)
        service.create(cmd)

        verify(exactly = 1) { tasksClient.insertTask(connection, "glist-write", any()) }
        verify(exactly = 0) { tasksClient.insertTask(connection, "glist-other", any()) }
    }

    @Test
    fun `create falls back to the first selected list when no write target is set`() {
        val firstSelected =
            TaskList(connectionId = connectionId, googleTaskListId = "glist-first", title = "Erste", isSelected = true)
                .also { it.id = UUID.randomUUID() }
        val secondSelected =
            TaskList(connectionId = connectionId, googleTaskListId = "glist-second", title = "Zweite", isSelected = true)
                .also { it.id = UUID.randomUUID() }
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(firstSelected, secondSelected)
        every { tasksClient.insertTask(connection, "glist-first", any()) } returns GoogleTask().setId("g-new").setTitle("X")
        every { taskRepository.save(any<Task>()) } answers { firstArg<Task>().also { it.id = UUID.randomUUID() } }

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = null)
        service.create(cmd)

        verify(exactly = 1) { tasksClient.insertTask(connection, "glist-first", any()) }
    }

    @Test
    fun `create throws when no selected list exists`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns emptyList()

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = null)

        assertThatThrownBy { service.create(cmd) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Keine Ziel-Aufgabenliste vorhanden")
        verify(exactly = 0) { tasksClient.insertTask(any(), any(), any()) }
    }

    @Test
    fun `create throws when the member has no google connection`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = null)

        assertThatThrownBy { service.create(cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Keine Google-Verbindung für dieses Mitglied gefunden")
    }

    @Test
    fun `create does not persist anything when google fails`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(writeTargetList)
        every { tasksClient.insertTask(connection, "glist-write", any()) } throws RuntimeException("Google down")

        val cmd = CreateTaskCommand(memberId = memberId, title = "X", notes = null, dueDate = null, priority = null)

        assertThatThrownBy { service.create(cmd) }.isInstanceOf(RuntimeException::class.java)
        verify(exactly = 0) { taskRepository.save(any<Task>()) }
    }

    // ─── update ───────────────────────────────────────────────────────────────

    private fun existingTask(
        title: String = "Alt",
        notes: String? = "alte Notiz",
        dueDate: LocalDate? = LocalDate.of(2026, 8, 15),
        status: String = "pending",
        completedAt: Instant? = null,
        priority: String? = null,
    ) = task(id = taskId, title = title, dueDate = dueDate, status = status, completedAt = completedAt, priority = priority)
        .also { it.notes = notes }

    private fun stubUpdatePrereqs(local: Task) {
        every { taskRepository.findById(taskId) } returns Optional.of(local)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findById(taskListId) } returns Optional.of(writeTargetList)
        every { taskRepository.save(any<Task>()) } answers { firstArg() }
    }

    @Test
    fun `update sends only title when only the title changes`() {
        val local = existingTask()
        stubUpdatePrereqs(local)
        val patchSlot = slot<GoogleTask>()
        every { tasksClient.patchTask(connection, "glist-write", local.googleTaskId, capture(patchSlot)) } returns
            GoogleTask().setId(local.googleTaskId).setTitle("Neuer Titel").setStatus("needsAction")

        val cmd = UpdateTaskCommand(title = "Neuer Titel", notes = null, dueDate = null, priority = null, status = null)
        val result = service.update(taskId, cmd)

        assertThat(patchSlot.captured.title).isEqualTo("Neuer Titel")
        assertThat(patchSlot.captured.notes).isNull()
        assertThat(patchSlot.captured.due).isNull()
        assertThat(patchSlot.captured.status).isNull()
        assertThat(result.title).isEqualTo("Neuer Titel")
    }

    @Test
    fun `update sends only notes when only the notes change`() {
        val local = existingTask()
        stubUpdatePrereqs(local)
        val patchSlot = slot<GoogleTask>()
        every { tasksClient.patchTask(connection, "glist-write", local.googleTaskId, capture(patchSlot)) } returns
            GoogleTask().setId(local.googleTaskId).setTitle(local.title).setNotes("Neue Notiz").setStatus("needsAction")

        val cmd = UpdateTaskCommand(title = null, notes = "Neue Notiz", dueDate = null, priority = null, status = null)
        val result = service.update(taskId, cmd)

        assertThat(patchSlot.captured.title).isNull()
        assertThat(patchSlot.captured.notes).isEqualTo("Neue Notiz")
        assertThat(patchSlot.captured.due).isNull()
        assertThat(result.notes).isEqualTo("Neue Notiz")
    }

    @Test
    fun `update sends only dueDate when only the dueDate changes`() {
        val local = existingTask()
        stubUpdatePrereqs(local)
        val patchSlot = slot<GoogleTask>()
        every { tasksClient.patchTask(connection, "glist-write", local.googleTaskId, capture(patchSlot)) } returns
            GoogleTask().setId(local.googleTaskId).setTitle(local.title).setDue("2026-09-01T00:00:00.000Z").setStatus("needsAction")

        val cmd = UpdateTaskCommand(title = null, notes = null, dueDate = LocalDate.of(2026, 9, 1), priority = null, status = null)
        val result = service.update(taskId, cmd)

        assertThat(patchSlot.captured.title).isNull()
        assertThat(patchSlot.captured.notes).isNull()
        assertThat(patchSlot.captured.due).isEqualTo("2026-09-01T00:00:00.000Z")
        assertThat(result.dueDate).isEqualTo(LocalDate.of(2026, 9, 1))
    }

    @Test
    fun `update keeps the priority local and never sends it to google`() {
        val local = existingTask(priority = null)
        stubUpdatePrereqs(local)

        val cmd = UpdateTaskCommand(title = null, notes = null, dueDate = null, priority = "high", status = null)
        val result = service.update(taskId, cmd)

        assertThat(result.priority).isEqualTo("high")
        verify(exactly = 0) { tasksClient.patchTask(any(), any(), any(), any()) }
    }

    @Test
    fun `update to completed sets completedAt`() {
        val local = existingTask(status = "pending", completedAt = null)
        stubUpdatePrereqs(local)
        every { tasksClient.patchTask(connection, "glist-write", local.googleTaskId, any()) } returns
            GoogleTask().setId(local.googleTaskId).setTitle(local.title).setStatus("completed").setCompleted("2026-08-10T09:00:00.000Z")

        val cmd = UpdateTaskCommand(title = null, notes = null, dueDate = null, priority = null, status = "completed")
        val result = service.update(taskId, cmd)

        assertThat(result.status).isEqualTo("completed")
        assertThat(result.completedAt).isEqualTo(Instant.parse("2026-08-10T09:00:00Z"))
    }

    @Test
    fun `update to pending clears completedAt`() {
        val local = existingTask(status = "completed", completedAt = Instant.parse("2026-08-09T09:00:00Z"))
        stubUpdatePrereqs(local)
        every { tasksClient.patchTask(connection, "glist-write", local.googleTaskId, any()) } returns
            GoogleTask().setId(local.googleTaskId).setTitle(local.title).setStatus("needsAction")

        val cmd = UpdateTaskCommand(title = null, notes = null, dueDate = null, priority = null, status = "pending")
        val result = service.update(taskId, cmd)

        assertThat(result.status).isEqualTo("pending")
        assertThat(result.completedAt).isNull()
    }

    @Test
    fun `update throws when the task does not exist`() {
        every { taskRepository.findById(taskId) } returns Optional.empty()

        val cmd = UpdateTaskCommand(title = "X", notes = null, dueDate = null, priority = null, status = null)

        assertThatThrownBy { service.update(taskId, cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Aufgabe nicht gefunden")
    }

    @Test
    fun `update throws when the task list assigned to the task no longer exists`() {
        val local = existingTask()
        every { taskRepository.findById(taskId) } returns Optional.of(local)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findById(taskListId) } returns Optional.empty()

        val cmd = UpdateTaskCommand(title = "X", notes = null, dueDate = null, priority = null, status = null)

        assertThatThrownBy { service.update(taskId, cmd) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessage("Aufgabenliste nicht gefunden")
        verify(exactly = 0) { tasksClient.patchTask(any(), any(), any(), any()) }
    }

    // ─── delete ───────────────────────────────────────────────────────────────

    @Test
    fun `delete removes the task at google and locally`() {
        val local = existingTask()
        every { taskRepository.findById(taskId) } returns Optional.of(local)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findById(taskListId) } returns Optional.of(writeTargetList)
        every { tasksClient.deleteTask(connection, "glist-write", local.googleTaskId) } returns Unit
        every { taskRepository.delete(local) } returns Unit

        service.delete(taskId)

        verifyOrder {
            tasksClient.deleteTask(connection, "glist-write", local.googleTaskId)
            taskRepository.delete(local)
        }
    }

    @Test
    fun `delete does not remove locally when google fails`() {
        val local = existingTask()
        every { taskRepository.findById(taskId) } returns Optional.of(local)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findById(taskListId) } returns Optional.of(writeTargetList)
        every { tasksClient.deleteTask(connection, "glist-write", local.googleTaskId) } throws RuntimeException("Google down")

        assertThatThrownBy { service.delete(taskId) }.isInstanceOf(RuntimeException::class.java)
        verify(exactly = 0) { taskRepository.delete(any()) }
    }
}
