package com.familyhub.google.connection

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface GoogleConnectionRepository : JpaRepository<GoogleConnection, UUID> {
    fun findByGoogleAccountId(googleAccountId: String): GoogleConnection?
    fun findByFamilyMemberId(familyMemberId: UUID): GoogleConnection?
    fun findAllByStatus(status: String): List<GoogleConnection>
}
