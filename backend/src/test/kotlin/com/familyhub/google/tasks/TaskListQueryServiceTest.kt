package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

class TaskListQueryServiceTest {
    private val connectionRepository = mockk<GoogleConnectionRepository>()
    private val taskListRepository = mockk<TaskListRepository>()
    private val taskSyncService = mockk<TaskSyncService>()

    private lateinit var service: TaskListQueryService

    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val connectionId: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")

    private val connection =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g123",
            email = "anna@example.com",
            accessToken = "enc_token",
            refreshToken = "enc_refresh",
            tokenExpiresAt = null,
            status = "active",
            lastSyncedAt = null,
        ).also { it.id = connectionId }

    @BeforeEach
    fun setUp() {
        service = TaskListQueryService(connectionRepository, taskListRepository, taskSyncService)
        justRun { taskListRepository.flush() }
    }

    private fun taskList(
        googleTaskListId: String,
        title: String = googleTaskListId,
        isSelected: Boolean = false,
        isWriteTarget: Boolean = false,
    ) = TaskList(
        connectionId = connectionId,
        googleTaskListId = googleTaskListId,
        title = title,
        isSelected = isSelected,
        isWriteTarget = isWriteTarget,
    ).also { it.id = UUID.randomUUID() }

    // ─── listForMember ──────────────────────────────────────────────────────

    @Test
    fun `listForMember returns an empty list when the member has no connection`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        val result = service.listForMember(memberId)

        assertThat(result).isEmpty()
        verify(exactly = 0) { taskSyncService.refreshTaskLists(any()) }
        verify(exactly = 0) { taskListRepository.findAllByConnectionId(any()) }
    }

    @Test
    fun `listForMember refreshes lists before returning them`() {
        val list1 = taskList("list1", title = "Einkauf", isSelected = true)
        val list2 = taskList("list2", title = "Arbeit")

        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        justRun { taskSyncService.refreshTaskLists(connection) }
        every { taskListRepository.findAllByConnectionId(connectionId) } returns listOf(list1, list2)

        val result = service.listForMember(memberId)

        verify(exactly = 1) { taskSyncService.refreshTaskLists(connection) }
        assertThat(result).hasSize(2)
        assertThat(result[0].id).isEqualTo("list1")
        assertThat(result[0].title).isEqualTo("Einkauf")
        assertThat(result[0].isSelected).isTrue()
        assertThat(result[0].memberId).isEqualTo(memberId)
        assertThat(result[1].id).isEqualTo("list2")
        assertThat(result[1].isSelected).isFalse()
    }

    // ─── listAll ────────────────────────────────────────────────────────────

    @Test
    fun `listAll spans all active connections`() {
        val conn1 = connectionWith(UUID.randomUUID())
        val conn2 = connectionWith(UUID.randomUUID())
        every { connectionRepository.findAllByStatus("active") } returns listOf(conn1, conn2)
        every { taskListRepository.findAllByConnectionId(conn1.id!!) } returns
            listOf(taskList("a", title = "A", isSelected = true))
        every { taskListRepository.findAllByConnectionId(conn2.id!!) } returns
            listOf(taskList("b", title = "B"))

        val result = service.listAll()

        assertThat(result.map { it.id }).containsExactly("a", "b")
        assertThat(result[0].memberId).isEqualTo(conn1.familyMemberId)
        assertThat(result[1].memberId).isEqualTo(conn2.familyMemberId)
    }

    // ─── saveSelection ──────────────────────────────────────────────────────

    @Test
    fun `saveSelection selects exactly the given ids`() {
        val a = taskList("a")
        val b = taskList("b")
        val c = taskList("c")
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionId(connectionId) } returns listOf(a, b, c)
        every { taskListRepository.save(any()) } answers { firstArg() }

        service.saveSelection(memberId, listOf("a", "b"), writeTargetId = null)

        assertThat(a.isSelected).isTrue()
        assertThat(b.isSelected).isTrue()
        assertThat(c.isSelected).isFalse()
        assertThat(a.isWriteTarget).isFalse()
        assertThat(b.isWriteTarget).isFalse()
        assertThat(c.isWriteTarget).isFalse()
    }

    @Test
    fun `saveSelection sets the write target and clears the previous one`() {
        val a = taskList("a", isSelected = true, isWriteTarget = true)
        val b = taskList("b")
        val savedOrder = mutableListOf<TaskList>()
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionId(connectionId) } returns listOf(a, b)
        every { taskListRepository.save(any()) } answers {
            savedOrder.add(firstArg())
            firstArg()
        }

        service.saveSelection(memberId, listOf("a", "b"), writeTargetId = "b")

        assertThat(a.isWriteTarget).isFalse()
        assertThat(b.isWriteTarget).isTrue()
        // The previous write target must be cleared (and saved) before the new one
        // is set, otherwise two rows would briefly carry is_write_target = TRUE and
        // violate the partial unique index idx_task_lists_write_target.
        verifyOrder {
            taskListRepository.save(a)
            taskListRepository.save(b)
        }
        assertThat(savedOrder.map { it.googleTaskListId }).containsExactly("a", "b")
        assertThat(savedOrder[0].isWriteTarget).isFalse()
    }

    @Test
    fun `saveSelection ignores a write target that is not selected`() {
        val a = taskList("a")
        val b = taskList("b")
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskListRepository.findAllByConnectionId(connectionId) } returns listOf(a, b)
        every { taskListRepository.save(any()) } answers { firstArg() }

        // "b" is not among the selected ids, so it must not become the write target.
        service.saveSelection(memberId, listOf("a"), writeTargetId = "b")

        assertThat(a.isSelected).isTrue()
        assertThat(a.isWriteTarget).isFalse()
        assertThat(b.isSelected).isFalse()
        assertThat(b.isWriteTarget).isFalse()
    }

    @Test
    fun `saveSelection throws when the member has no connection`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        assertThatThrownBy { service.saveSelection(memberId, listOf("a"), writeTargetId = null) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Keine Google-Verbindung für dieses Mitglied gefunden")

        verify(exactly = 0) { taskListRepository.findAllByConnectionId(any()) }
        verify(exactly = 0) { taskListRepository.save(any()) }
    }

    // ─── syncForMember ──────────────────────────────────────────────────────

    @Test
    fun `syncForMember delegates to the sync service`() {
        val expectedResult = TaskSyncResult(created = 3, updated = 1, deleted = 2)
        every { connectionRepository.findByFamilyMemberId(memberId) } returns connection
        every { taskSyncService.syncConnection(connection) } returns expectedResult

        val result = service.syncForMember(memberId)

        assertThat(result).isEqualTo(expectedResult)
        verify(exactly = 1) { taskSyncService.syncConnection(connection) }
    }

    @Test
    fun `syncForMember throws when the member has no connection`() {
        every { connectionRepository.findByFamilyMemberId(memberId) } returns null

        assertThatThrownBy { service.syncForMember(memberId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Keine Google-Verbindung für dieses Mitglied gefunden")

        verify(exactly = 0) { taskSyncService.syncConnection(any()) }
    }

    private fun connectionWith(memberId: UUID) =
        GoogleConnection(
            familyMemberId = memberId,
            credentialsId = null,
            googleAccountId = "g-$memberId",
            email = "e",
            accessToken = null,
            refreshToken = "r",
            tokenExpiresAt = null,
            status = "active",
        ).also { it.id = UUID.randomUUID() }
}
