package com.familyhub.google.credentials

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface GoogleCredentialsRepository : JpaRepository<GoogleCredentials, UUID> {
    fun findByIsPrimaryTrue(): GoogleCredentials?

    fun findAllByIsActiveTrue(): List<GoogleCredentials>
}
