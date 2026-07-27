package com.familyhub.members

import com.familyhub.generated.api.MembersApi
import com.familyhub.generated.model.MemberRequest
import com.familyhub.generated.model.MemberResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class MembersController(
    private val memberService: MemberService,
) : MembersApi {
    override fun listMembers(): ResponseEntity<List<MemberResponse>> = ResponseEntity.ok(memberService.list())

    @RequiresPinSession
    override fun createMember(memberRequest: MemberRequest): ResponseEntity<MemberResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(memberService.create(memberRequest))

    @RequiresPinSession
    override fun updateMember(
        id: UUID,
        memberRequest: MemberRequest,
    ): ResponseEntity<MemberResponse> = ResponseEntity.ok(memberService.update(id, memberRequest))

    @RequiresPinSession
    override fun deleteMember(id: UUID): ResponseEntity<Unit> {
        memberService.delete(id)
        return ResponseEntity.noContent().build()
    }
}
