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
import java.util.UUID

@Entity
@Table(name = "task_lists")
class TaskList(
    @Column(name = "connection_id", nullable = false)
    var connectionId: UUID,
    @Column(name = "google_task_list_id", nullable = false)
    var googleTaskListId: String,
    @Column(nullable = false)
    var title: String,
    @Column(name = "is_selected", nullable = false)
    var isSelected: Boolean = false,
    @Column(name = "is_write_target", nullable = false)
    var isWriteTarget: Boolean = false,
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
