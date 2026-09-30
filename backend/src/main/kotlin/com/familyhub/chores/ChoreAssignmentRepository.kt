package com.familyhub.chores

import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface ChoreAssignmentRepository : JpaRepository<ChoreAssignment, UUID> {
    fun findAllByStatus(status: String): List<ChoreAssignment>

    /** Offene plus die heute erledigten — die Antwort wächst nicht mit den Jahren. */
    fun findAllByStatusOrCompletedAtGreaterThanEqual(
        status: String,
        threshold: Instant,
    ): List<ChoreAssignment>

    fun findByChoreIdAndStatus(
        choreId: UUID,
        status: String,
    ): ChoreAssignment?

    fun existsByChoreIdAndStatus(
        choreId: UUID,
        status: String,
    ): Boolean

    fun countByMemberIdAndStatus(
        memberId: UUID,
        status: String,
    ): Long
}
