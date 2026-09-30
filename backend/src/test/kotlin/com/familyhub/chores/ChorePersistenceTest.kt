package com.familyhub.chores

import com.familyhub.BaseIntegrationTest
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Prüft die Migration gegen die echte Datenbank — insbesondere den partiellen
 * Unique-Index, den kein In-Memory-Ersatz nachbildet.
 */
class ChorePersistenceTest
    @Autowired
    constructor(
        private val chores: ChoreRepository,
        private val assignments: ChoreAssignmentRepository,
        private val members: FamilyMemberRepository,
    ) : BaseIntegrationTest() {
        private lateinit var memberId: UUID
        private lateinit var choreId: UUID

        @BeforeEach
        fun setUp() {
            assignments.deleteAll()
            chores.deleteAll()
            members.deleteAll()
            memberId = members.save(FamilyMember(name = "Anna", role = "child", color = "pink")).id!!
            choreId =
                chores.save(
                    Chore(
                        name = "Toilette putzen",
                        icon = "🚽",
                        intervalDays = 7,
                        assignmentGroup = GROUP_ALL,
                        nextDueOn = LocalDate.of(2026, 9, 22),
                    ),
                ).id!!
        }

        @AfterEach
        fun tearDown() {
            // This class runs against the real, shared Testcontainers Postgres
            // instance (no @Transactional rollback — the point is testing the
            // real partial unique index). Without an explicit teardown, rows
            // committed here would leak into other integration test classes
            // sharing the same container/JVM.
            assignments.deleteAll()
            chores.deleteAll()
            members.deleteAll()
        }

        private fun open(on: LocalDate = LocalDate.of(2026, 9, 22)) =
            ChoreAssignment(choreId = choreId, memberId = memberId, points = 10, assignedOn = on)

        @Test
        fun `eine Vorlage kann nur eine offene Zuweisung haben`() {
            assignments.saveAndFlush(open())

            assertThatThrownBy { assignments.saveAndFlush(open()) }
                .hasMessageContaining("ux_chore_assignments_one_open")
        }

        @Test
        fun `eine erledigte Zuweisung blockiert eine neue offene nicht`() {
            val done = assignments.saveAndFlush(open())
            done.status = STATUS_COMPLETED
            done.completedAt = Instant.parse("2026-09-22T10:00:00Z")
            assignments.saveAndFlush(done)

            val second = assignments.saveAndFlush(open(LocalDate.of(2026, 9, 29)))

            assertThat(second.id).isNotNull()
            assertThat(assignments.existsByChoreIdAndStatus(choreId, STATUS_OPEN)).isTrue()
        }

        @Test
        fun `faellige Vorlagen kommen nach nextDueOn sortiert heraus`() {
            chores.save(
                Chore(
                    name = "Müll",
                    icon = "🗑️",
                    intervalDays = 1,
                    assignmentGroup = GROUP_ALL,
                    nextDueOn = LocalDate.of(2026, 9, 20),
                ),
            )
            chores.save(
                Chore(
                    name = "Später",
                    icon = "🪟",
                    intervalDays = 30,
                    assignmentGroup = GROUP_ALL,
                    nextDueOn = LocalDate.of(2026, 9, 30),
                ),
            )

            val due =
                chores.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(
                    LocalDate.of(2026, 9, 22),
                )

            assertThat(due.map { it.name }).containsExactly("Müll", "Toilette putzen")
        }

        @Test
        fun `Loeschen einer Vorlage nimmt ihre Zuweisungen mit`() {
            assignments.saveAndFlush(open())

            chores.deleteById(choreId)
            chores.flush()

            assertThat(assignments.findAllByStatus(STATUS_OPEN)).isEmpty()
        }

        @Test
        fun `Loeschen eines Mitglieds nimmt seine Zuweisungen mit`() {
            val otherMemberId = members.save(FamilyMember(name = "Ben", role = "child", color = "blue")).id!!
            val assignment =
                assignments.saveAndFlush(
                    ChoreAssignment(
                        choreId = choreId,
                        memberId = otherMemberId,
                        points = 10,
                        assignedOn = LocalDate.of(2026, 9, 22),
                    ),
                )

            members.deleteById(otherMemberId)
            members.flush()

            assertThat(assignments.findById(assignment.id!!)).isEmpty()
        }

        @Test
        fun `Loeschen eines Mitglieds setzt den Rotationszeiger der Vorlage auf null statt sie mitzureissen`() {
            val otherMemberId = members.save(FamilyMember(name = "Clara", role = "child", color = "green")).id!!
            val chore = chores.findById(choreId).orElseThrow()
            chore.lastAssignedMemberId = otherMemberId
            chores.saveAndFlush(chore)

            members.deleteById(otherMemberId)
            members.flush()

            val reloaded = chores.findById(choreId).orElseThrow()
            assertThat(reloaded.lastAssignedMemberId).isNull()
            assertThat(chores.existsById(choreId)).isTrue()
        }

        @Test
        fun `zaehlt offene Zuweisungen je Mitglied`() {
            assignments.saveAndFlush(open())

            assertThat(assignments.countByMemberIdAndStatus(memberId, STATUS_OPEN)).isEqualTo(1)
            assertThat(assignments.countByMemberIdAndStatus(memberId, STATUS_COMPLETED)).isZero()
        }
    }
