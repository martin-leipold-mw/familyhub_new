package com.familyhub.members

import com.familyhub.generated.model.MemberRequest
import com.familyhub.generated.model.MemberResponse
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.ZoneOffset
import java.util.UUID

@Service
class MemberService(
    private val repository: FamilyMemberRepository,
) {
    fun list(): List<MemberResponse> = repository.findByIsActiveTrueOrderByCreatedAtAsc().map { it.toResponse() }

    @Transactional
    fun create(req: MemberRequest): MemberResponse {
        val name = validName(req.name)
        val member =
            FamilyMember(
                name = name,
                role = req.role,
                color = req.color,
                dateOfBirth = req.dateOfBirth,
            )
        return repository.save(member).toResponse()
    }

    @Transactional
    fun update(
        id: UUID,
        req: MemberRequest,
    ): MemberResponse {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.name = validName(req.name)
        member.role = req.role
        member.color = req.color
        member.dateOfBirth = req.dateOfBirth
        return repository.save(member).toResponse()
    }

    @Transactional
    fun delete(id: UUID) {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.isActive = false
        repository.save(member)
    }

    fun getAvatar(id: UUID): ByteArray {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        return member.avatarData ?: throw MemberNotFoundException()
    }

    @Transactional
    fun saveAvatar(
        id: UUID,
        bytes: ByteArray,
    ) {
        val member = repository.findById(id).orElseThrow { MemberNotFoundException() }
        member.avatarData = bytes
        repository.save(member)
    }

    private fun validName(raw: String): String {
        val name = raw.trim()
        if (name.length < 2) throw ValidationException("Name muss mindestens 2 Zeichen lang sein")
        return name
    }

    private fun FamilyMember.toResponse(): MemberResponse =
        MemberResponse(
            id = this.id!!,
            name = this.name,
            role = this.role,
            color = this.color,
            isActive = this.isActive,
            createdAt = this.createdAt!!.atOffset(ZoneOffset.UTC),
            updatedAt = this.updatedAt!!.atOffset(ZoneOffset.UTC),
            dateOfBirth = this.dateOfBirth,
            avatarUrl = if (this.avatarData != null) "/api/v1/members/${this.id}/avatar" else null,
        )
}
