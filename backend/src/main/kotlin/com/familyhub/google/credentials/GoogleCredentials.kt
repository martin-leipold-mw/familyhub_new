package com.familyhub.google.credentials

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
@Table(name = "google_credentials")
class GoogleCredentials(
    // encrypted
    @Column(name = "client_id", nullable = false) var clientId: String,
    // encrypted
    @Column(name = "client_secret", nullable = false) var clientSecret: String,
    @Column(name = "redirect_uri", nullable = false) var redirectUri: String,
    @Column(nullable = false) var nickname: String,
    @Column(name = "is_primary", nullable = false) var isPrimary: Boolean = false,
    @Column(name = "is_active", nullable = false) var isActive: Boolean = true,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist protected fun onCreate() {
        val n = Instant.now()
        createdAt = n
        updatedAt = n
    }

    @PreUpdate protected fun onUpdate() {
        updatedAt = Instant.now()
    }
}
