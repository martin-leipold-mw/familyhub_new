package com.familyhub.members

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
@Table(name = "family_members")
class FamilyMember(
    @Column(nullable = false)
    var name: String,

    @Column(nullable = false)
    var role: String,

    @Column(nullable = false)
    var color: String,

    @Column(name = "date_of_birth")
    var dateOfBirth: LocalDate? = null,

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "avatar_data")
    var avatarData: ByteArray? = null,

    @Column(name = "avatar_url")
    var avatarUrl: String? = null,
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
