package com.familyhub.members

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

@Transactional
class FamilyMemberRepositoryIntegrationTest : BaseIntegrationTest() {

    @Autowired
    lateinit var repository: FamilyMemberRepository

    @Test
    fun `saves and reads a member with all new columns`() {
        val saved = repository.save(
            FamilyMember(name = "Anna", role = "parent", color = "blue")
        )

        val found = repository.findById(saved.id!!).orElseThrow()
        assertThat(found.name).isEqualTo("Anna")
        assertThat(found.role).isEqualTo("parent")
        assertThat(found.color).isEqualTo("blue")
        assertThat(found.isActive).isTrue()
        assertThat(found.avatarData).isNull()
        assertThat(found.createdAt).isNotNull()
        assertThat(found.updatedAt).isNotNull()
    }

    @Test
    fun `findByIsActiveTrue excludes soft-deleted members`() {
        repository.save(FamilyMember(name = "Aktiv", role = "child", color = "pink"))
        repository.save(FamilyMember(name = "Weg", role = "child", color = "green", isActive = false))

        val active = repository.findByIsActiveTrueOrderByCreatedAtAsc()
        assertThat(active).extracting<String> { it.name }.containsExactly("Aktiv")
        assertThat(repository.countByIsActiveTrue()).isEqualTo(1L)
    }
}
