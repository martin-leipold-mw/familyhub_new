package com.familyhub.google.tasks

import com.familyhub.BaseIntegrationTest
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

/**
 * Exercises [TaskListQueryService.saveSelection]'s "move the write target" branch against the
 * real partial unique index (`idx_task_lists_write_target`, V11), which allows at most one
 * `is_write_target = TRUE` row per connection and is non-deferrable.
 *
 * `saveSelection` is not `@Transactional` itself, so in production each `save()` call typically
 * joins its own short-lived transaction and commits immediately. Wrapping the whole test in
 * `@Transactional` (as this class does) reproduces the worst case instead: every repository call
 * joins one ambient transaction, so nothing actually hits the database until a flush. At that
 * point Hibernate's dirty-checking writes changed rows in the order the entities were first
 * attached to the persistence context (here: the order this test's own `taskLists.save(...)` calls
 * ran) — NOT the order `saveSelection` happens to call `save()` or mutate fields. Each test below
 * therefore deliberately inserts the future *new* write target before the current *old* one, so a
 * naive implementation would flush "set new target TRUE" before "clear old target FALSE" and hit
 * the unique index. `saveSelection` avoids this with an explicit intermediate
 * `taskListRepository.flush()` between clearing the old target and setting the new one, forcing
 * the "clear" UPDATE to the database immediately, decoupled from persistence-context ordering.
 */
@Transactional
class TaskListWriteTargetMoveIntegrationTest
    @Autowired
    constructor(
        private val members: FamilyMemberRepository,
        private val connections: GoogleConnectionRepository,
        private val taskLists: TaskListRepository,
        private val service: TaskListQueryService,
    ) : BaseIntegrationTest() {
        private fun connection(): GoogleConnection {
            val member = members.save(FamilyMember(name = "Mama", role = "parent", color = "blue"))
            return connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!,
                    credentialsId = null,
                    googleAccountId = "acc-${member.id}",
                    email = "mama@example.com",
                    accessToken = null,
                    refreshToken = "refresh",
                    tokenExpiresAt = null,
                    status = "active",
                ),
            )
        }

        @Test
        fun `moving the write target to another selected list does not violate the unique index`() {
            val conn = connection()
            // Deliberately insert the future new target (B) before the current old target (A):
            // findAllByConnectionId has no ORDER BY, and Postgres returns freshly inserted rows of
            // a small table via a plain sequential scan in heap/insertion order, so this makes the
            // repository return B before A. That is the adversarial processing order for a naive
            // "assign + save per list" loop (it would set B's write target TRUE before A's is
            // cleared to FALSE), which is exactly the ordering this test guards against.
            val listB =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-b", title = "B", isSelected = true),
                )
            val listA =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-a", title = "A", isSelected = true, isWriteTarget = true),
                )

            service.saveSelection(
                memberId = conn.familyMemberId,
                taskListIds = listOf(listA.googleTaskListId, listB.googleTaskListId),
                writeTargetId = listB.googleTaskListId,
            )
            // Force the flush here rather than relying on transaction commit, so the assertion
            // below fails with the real DataIntegrityViolationException if the move is unsafe.
            taskLists.flush()

            val reloaded = taskLists.findAllByConnectionId(conn.id!!)
            val writeTargets = reloaded.filter { it.isWriteTarget }
            assertThat(writeTargets).hasSize(1)
            assertThat(writeTargets.single().googleTaskListId).isEqualTo("list-b")
            assertThat(reloaded.first { it.googleTaskListId == "list-a" }.isWriteTarget).isFalse()
        }

        @Test
        fun `deselecting the previous write target entirely does not violate the unique index`() {
            val conn = connection()
            // Same adversarial insertion order as above: B (the future new target) before A (the
            // current write target), so a naive per-list loop would process B before A.
            val listB =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-b", title = "B", isSelected = false),
                )
            val listA =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-a", title = "A", isSelected = true, isWriteTarget = true),
                )

            // "a" (the old write target) is dropped from the selection entirely; "b" becomes both
            // selected and the new write target.
            service.saveSelection(
                memberId = conn.familyMemberId,
                taskListIds = listOf(listB.googleTaskListId),
                writeTargetId = listB.googleTaskListId,
            )
            taskLists.flush()

            val reloaded = taskLists.findAllByConnectionId(conn.id!!)
            val writeTargets = reloaded.filter { it.isWriteTarget }
            assertThat(writeTargets).hasSize(1)
            assertThat(writeTargets.single().googleTaskListId).isEqualTo("list-b")
            val reloadedA = reloaded.first { it.googleTaskListId == "list-a" }
            assertThat(reloadedA.isSelected).isFalse()
            assertThat(reloadedA.isWriteTarget).isFalse()
        }

        @Test
        fun `setting the write target when none exists yet succeeds`() {
            val conn = connection()
            val listX =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-x", title = "X", isSelected = true),
                )

            service.saveSelection(
                memberId = conn.familyMemberId,
                taskListIds = listOf(listX.googleTaskListId),
                writeTargetId = listX.googleTaskListId,
            )
            taskLists.flush()

            val reloaded = taskLists.findById(listX.id!!).get()
            assertThat(reloaded.isWriteTarget).isTrue()
        }
    }
