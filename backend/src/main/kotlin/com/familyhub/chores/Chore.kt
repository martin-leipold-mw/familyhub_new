package com.familyhub.chores

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.PreUpdate
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

const val GROUP_PARENTS = "parents"
const val GROUP_CHILDREN = "children"
const val GROUP_ALL = "all"

val ASSIGNMENT_GROUPS = setOf(GROUP_PARENTS, GROUP_CHILDREN, GROUP_ALL)

/**
 * Die Ämtli-Vorlage. [nextDueOn] ist ihr vollständiger Terminzustand: Steht es
 * auf heute oder früher und hat die Vorlage keine offene Zuweisung, wird sie im
 * nächsten Ausgabelauf verteilt. Erst die Erledigung schreibt es fort.
 */
@Entity
@Table(name = "chores")
class Chore(
    @Column(nullable = false)
    var name: String,
    @Column(nullable = false)
    var icon: String,
    @Column
    var description: String? = null,
    @Column(name = "interval_days", nullable = false)
    var intervalDays: Int,
    @Column(name = "assignment_group", nullable = false)
    var assignmentGroup: String,
    @Column(nullable = false)
    var points: Int = 10,
    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,
    @Column(name = "next_due_on", nullable = false)
    var nextDueOn: LocalDate,
    @Column(name = "last_assigned_member_id")
    var lastAssignedMemberId: UUID? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist
    protected fun onCreate() {
        val now = Instant.now()
        createdAt = now
        updatedAt = now
    }

    @PreUpdate
    protected fun onUpdate() {
        updatedAt = Instant.now()
    }
}
