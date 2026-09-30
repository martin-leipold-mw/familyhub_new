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

const val STATUS_OPEN = "open"
const val STATUS_COMPLETED = "completed"

/**
 * Eine ausgegebene Aufgabe. Verbucht wird immer auf [memberId] — es gibt kein
 * `completedByMemberId`, also auch keine Möglichkeit, fremde Punkte gutzuschreiben.
 * [points] ist die eingefrorene Kopie aus der Vorlage.
 */
@Entity
@Table(name = "chore_assignments")
class ChoreAssignment(
    @Column(name = "chore_id", nullable = false)
    var choreId: UUID,
    @Column(name = "member_id", nullable = false)
    var memberId: UUID,
    @Column(nullable = false)
    var status: String = STATUS_OPEN,
    @Column(nullable = false)
    var points: Int,
    @Column(name = "assigned_on", nullable = false)
    var assignedOn: LocalDate,
    @Column(name = "completed_at")
    var completedAt: Instant? = null,
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
