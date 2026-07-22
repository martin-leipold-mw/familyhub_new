package com.familyhub.settings

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.PreUpdate
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "settings")
class Setting(
    @Id
    var key: String,

    @Column(nullable = false)
    var value: String,
) {
    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist
    @PreUpdate
    protected fun onWrite() {
        updatedAt = Instant.now()
    }
}
