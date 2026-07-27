package com.familyhub.settings

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.annotation.Transactional

@Transactional
class SettingRepositoryIntegrationTest : BaseIntegrationTest() {
    @Autowired
    lateinit var repository: SettingRepository

    @Test
    fun `V3 seeds setup keys`() {
        assertThat(repository.findById("setup.completed").orElseThrow().value).isEqualTo("false")
        assertThat(repository.findById("setup.step").orElseThrow().value).isEqualTo("1")
    }

    @Test
    fun `saves and updates a setting value`() {
        repository.save(Setting(key = "pin", value = "1234"))
        val stored = repository.findById("pin").orElseThrow()
        assertThat(stored.value).isEqualTo("1234")
    }
}
