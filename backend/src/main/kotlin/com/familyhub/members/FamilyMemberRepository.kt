package com.familyhub.members

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface FamilyMemberRepository : JpaRepository<FamilyMember, UUID> {
    fun findByIsActiveTrueOrderByCreatedAtAsc(): List<FamilyMember>

    fun countByIsActiveTrue(): Long
}
