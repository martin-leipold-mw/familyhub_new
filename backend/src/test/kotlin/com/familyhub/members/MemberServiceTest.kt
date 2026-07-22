package com.familyhub.members

import com.familyhub.generated.model.MemberRequest
import com.familyhub.shared.exceptions.MemberNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class MemberServiceTest {

    private val repository = mockk<FamilyMemberRepository>()
    private val service = MemberService(repository)

    private fun member(name: String = "Anna", withAvatar: Boolean = false): FamilyMember {
        val m = FamilyMember(name = name, role = "parent", color = "blue")
        m.id = UUID.randomUUID()
        m.createdAt = Instant.parse("2026-07-22T10:00:00Z")
        m.updatedAt = Instant.parse("2026-07-22T10:00:00Z")
        if (withAvatar) m.avatarData = byteArrayOf(1, 2, 3)
        return m
    }

    @Test
    fun `list maps active members with avatar url`() {
        every { repository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(member(withAvatar = true))
        val result = service.list()
        assertThat(result).hasSize(1)
        assertThat(result[0].name).isEqualTo("Anna")
        assertThat(result[0].avatarUrl).endsWith("/avatar")
    }

    @Test
    fun `list returns null avatar url without avatar`() {
        every { repository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(member())
        assertThat(service.list()[0].avatarUrl).isNull()
    }

    @Test
    fun `create trims name and saves`() {
        every { repository.save(any()) } answers { firstArg<FamilyMember>().also { it.id = UUID.randomUUID(); it.createdAt = Instant.now(); it.updatedAt = Instant.now() } }
        val saved = slot<FamilyMember>()
        service.create(MemberRequest(name = "  Bea  ", role = "child", color = "pink", dateOfBirth = LocalDate.of(2015, 1, 1)))
        verify { repository.save(capture(saved)) }
        assertThat(saved.captured.name).isEqualTo("Bea")
        assertThat(saved.captured.dateOfBirth).isEqualTo(LocalDate.of(2015, 1, 1))
    }

    @Test
    fun `create rejects short name after trim`() {
        assertThatThrownBy {
            service.create(MemberRequest(name = " a ", role = "child", color = "pink"))
        }.isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update modifies existing member`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        val result = service.update(existing.id!!, MemberRequest(name = "Neu", role = "child", color = "green"))
        assertThat(result.name).isEqualTo("Neu")
        assertThat(result.role).isEqualTo("child")
    }

    @Test
    fun `update rejects short name`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThatThrownBy {
            service.update(existing.id!!, MemberRequest(name = "a", role = "child", color = "green"))
        }.isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy {
            service.update(id, MemberRequest(name = "Neu", role = "child", color = "green"))
        }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `delete soft-deletes member`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        service.delete(existing.id!!)
        assertThat(existing.isActive).isFalse()
        verify { repository.save(existing) }
    }

    @Test
    fun `delete throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.delete(id) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `getAvatar returns bytes`() {
        val existing = member(withAvatar = true)
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThat(service.getAvatar(existing.id!!)).containsExactly(1, 2, 3)
    }

    @Test
    fun `getAvatar throws when no avatar`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        assertThatThrownBy { service.getAvatar(existing.id!!) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `getAvatar throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.getAvatar(id) }.isInstanceOf(MemberNotFoundException::class.java)
    }

    @Test
    fun `saveAvatar stores bytes`() {
        val existing = member()
        every { repository.findById(existing.id!!) } returns Optional.of(existing)
        every { repository.save(any()) } answers { firstArg() }
        service.saveAvatar(existing.id!!, byteArrayOf(9, 9))
        assertThat(existing.avatarData).containsExactly(9, 9)
    }

    @Test
    fun `saveAvatar throws when member missing`() {
        val id = UUID.randomUUID()
        every { repository.findById(id) } returns Optional.empty()
        assertThatThrownBy { service.saveAvatar(id, byteArrayOf(1)) }.isInstanceOf(MemberNotFoundException::class.java)
    }
}
