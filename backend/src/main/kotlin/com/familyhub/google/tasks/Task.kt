package com.familyhub.google.tasks

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

@Entity
@Table(name = "tasks")
class Task(
    @Column(name = "task_list_id", nullable = false)
    var taskListId: UUID,
    @Column(name = "google_task_id", nullable = false)
    var googleTaskId: String,
    @Column(name = "owner_member_id", nullable = false)
    var ownerMemberId: UUID,
    @Column(nullable = false)
    var title: String,
    @Column
    var notes: String? = null,
    @Column(name = "due_date")
    var dueDate: LocalDate? = null,
    @Column(nullable = false)
    var status: String = "pending",
    @Column
    var priority: String? = null,
    @Column(name = "completed_at")
    var completedAt: Instant? = null,
    @Column
    var etag: String? = null,
    @Column(name = "google_updated")
    var googleUpdated: Instant? = null,
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
