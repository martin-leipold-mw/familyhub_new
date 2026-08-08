package com.familyhub.google.tasks

import com.familyhub.BaseIntegrationTest
import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.transaction.annotation.Transactional

@Transactional
class TaskPersistenceTest
    @Autowired
    constructor(
        private val members: FamilyMemberRepository,
        private val connections: GoogleConnectionRepository,
        private val taskLists: TaskListRepository,
        private val tasks: TaskRepository,
    ) : BaseIntegrationTest() {
        private fun connection(): GoogleConnection {
            val member = members.save(FamilyMember(name = "Papa", role = "parent", color = "green"))
            return connections.save(
                GoogleConnection(
                    familyMemberId = member.id!!,
                    credentialsId = null,
                    googleAccountId = "acc-${member.id}",
                    email = "papa@example.com",
                    accessToken = null,
                    refreshToken = "refresh",
                    tokenExpiresAt = null,
                    status = "active",
                ),
            )
        }

        @Test
        fun `saves a task list and finds it by connection and google id`() {
            val conn = connection()
            val saved =
                taskLists.save(
                    TaskList(
                        connectionId = conn.id!!,
                        googleTaskListId = "list-1",
                        title = "Einkaufsliste",
                    ),
                )
            val found = taskLists.findByConnectionIdAndGoogleTaskListId(conn.id!!, "list-1")
            assertThat(found).isNotNull
            assertThat(found!!.id).isEqualTo(saved.id)
        }

        @Test
        fun `rejects a second task list with the same google id on one connection`() {
            val conn = connection()
            taskLists.save(TaskList(connectionId = conn.id!!, googleTaskListId = "list-1", title = "A"))
            assertThatThrownBy {
                taskLists.saveAndFlush(TaskList(connectionId = conn.id!!, googleTaskListId = "list-1", title = "B"))
            }.isInstanceOf(DataIntegrityViolationException::class.java)
        }

        @Test
        fun `rejects a second write target on one connection`() {
            val conn = connection()
            taskLists.save(
                TaskList(connectionId = conn.id!!, googleTaskListId = "list-1", title = "A", isWriteTarget = true),
            )
            assertThatThrownBy {
                taskLists.saveAndFlush(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-2", title = "B", isWriteTarget = true),
                )
            }.isInstanceOf(DataIntegrityViolationException::class.java)
        }

        @Test
        fun `deletes tasks when their task list is deleted`() {
            val conn = connection()
            val member = members.save(FamilyMember(name = "Mama", role = "parent", color = "blue"))
            val list =
                taskLists.save(
                    TaskList(connectionId = conn.id!!, googleTaskListId = "list-1", title = "A"),
                )
            tasks.save(
                Task(
                    taskListId = list.id!!,
                    googleTaskId = "task-1",
                    ownerMemberId = member.id!!,
                    title = "Müll rausbringen",
                ),
            )
            taskLists.delete(list)
            taskLists.flush()
            assertThat(tasks.findAllByTaskListId(list.id!!)).isEmpty()
        }
    }
