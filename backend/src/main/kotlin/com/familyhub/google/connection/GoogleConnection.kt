package com.familyhub.google.connection

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.Table
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "google_connections")
class GoogleConnection(
    @Column(name = "family_member_id", nullable = false) var familyMemberId: UUID,
    @Column(name = "credentials_id") var credentialsId: UUID?,
    @Column(name = "google_account_id", nullable = false) var googleAccountId: String,
    @Column(nullable = false) var email: String,
    // encrypted
    @Column(name = "access_token") var accessToken: String?,
    // encrypted
    @Column(name = "refresh_token", nullable = false) var refreshToken: String,
    @Column(name = "token_expires_at") var tokenExpiresAt: Instant?,
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false, columnDefinition = "jsonb")
    var scopes: List<String> = emptyList(),
    @Column(nullable = false) var status: String = "active",
    @Column(name = "last_synced_at") var lastSyncedAt: Instant? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "connected_at", updatable = false)
    var connectedAt: Instant? = null

    @PrePersist protected fun onCreate() {
        connectedAt = Instant.now()
    }
}
