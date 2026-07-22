package com.familyhub.members

import com.familyhub.pin.RequiresPinSession
import com.familyhub.shared.exceptions.PayloadTooLargeException
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/v1/members")
class MemberAvatarController(
    private val memberService: MemberService,
) {

    @GetMapping("/{id}/avatar", produces = [MediaType.IMAGE_JPEG_VALUE])
    fun getAvatar(@PathVariable id: UUID): ResponseEntity<ByteArray> =
        ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(memberService.getAvatar(id))

    @RequiresPinSession
    @PutMapping("/{id}/avatar", consumes = [MediaType.IMAGE_JPEG_VALUE])
    fun putAvatar(@PathVariable id: UUID, @RequestBody bytes: ByteArray): ResponseEntity<Unit> {
        if (bytes.size > MAX_AVATAR_BYTES) throw PayloadTooLargeException()
        memberService.saveAvatar(id, bytes)
        return ResponseEntity.noContent().build()
    }

    companion object {
        const val MAX_AVATAR_BYTES = 500 * 1024
    }
}
