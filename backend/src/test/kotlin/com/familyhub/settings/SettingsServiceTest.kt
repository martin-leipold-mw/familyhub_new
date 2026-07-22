package com.familyhub.settings

import com.familyhub.members.FamilyMemberRepository
import com.familyhub.pin.PinSessionService
import com.familyhub.shared.exceptions.InvalidPinException
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.Optional
import java.util.UUID

class SettingsServiceTest {

    private val settingRepository = mockk<SettingRepository>(relaxed = true)
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val pinSessionService = mockk<PinSessionService>()
    private val service = SettingsService(settingRepository, memberRepository, pinSessionService)

    init {
        every { settingRepository.save(ofType()) } answers { firstArg() }
    }

    private fun stubSetting(key: String, value: String?) {
        every { settingRepository.findById(key) } returns
            (value?.let { Optional.of(Setting(key = key, value = it)) } ?: Optional.empty())
    }

    @Test
    fun `getSetupStatus reflects stored keys and member count`() {
        stubSetting("setup.completed", "false")
        stubSetting("setup.step", "2")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L

        val status = service.getSetupStatus()
        assertThat(status.setupCompleted).isFalse()
        assertThat(status.currentStep).isEqualTo(2)
        assertThat(status.hasFamilyMembers).isTrue()
        assertThat(status.hasPin).isFalse()
    }

    @Test
    fun `getSetupStatus defaults step to 1 when unparaseable`() {
        stubSetting("setup.completed", "true")
        stubSetting("setup.step", null)
        stubSetting("pin", "1234")
        every { memberRepository.countByIsActiveTrue() } returns 0L

        val status = service.getSetupStatus()
        assertThat(status.currentStep).isEqualTo(1)
        assertThat(status.hasPin).isTrue()
        assertThat(status.hasFamilyMembers).isFalse()
    }

    @Test
    fun `updateSetupStep rejects when setup already completed`() {
        stubSetting("setup.completed", "true")
        assertThatThrownBy { service.updateSetupStep(2) }
            .isInstanceOf(SetupAlreadyCompletedException::class.java)
    }

    @Test
    fun `updateSetupStep rejects out-of-range step`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.updateSetupStep(4) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `updateSetupStep stores valid step`() {
        stubSetting("setup.completed", "false")
        stubSetting("setup.step", "1")
        service.updateSetupStep(3)
        val saved = slot<Setting>()
        verify { settingRepository.save(capture(saved)) }
        assertThat(saved.captured.key).isEqualTo("setup.step")
        assertThat(saved.captured.value).isEqualTo("3")
    }

    @Test
    fun `setPin rejects when already completed`() {
        stubSetting("setup.completed", "true")
        assertThatThrownBy { service.setPin("1234") }
            .isInstanceOf(SetupAlreadyCompletedException::class.java)
    }

    @Test
    fun `setPin rejects bad format`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.setPin("12") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `setPin stores pin, completes setup and returns token`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        val token = UUID.randomUUID()
        every { pinSessionService.createSession() } returns token

        val result = service.setPin("1234")
        assertThat(result).isEqualTo(token.toString())
        verify { settingRepository.save(match { it.key == "pin" && it.value == "1234" }) }
        verify { settingRepository.save(match { it.key == "setup.completed" && it.value == "true" }) }
    }

    @Test
    fun `verifyPin rejects when no pin set`() {
        stubSetting("pin", null)
        assertThatThrownBy { service.verifyPin("1234") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `verifyPin rejects wrong pin`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.verifyPin("9999") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `verifyPin returns token on match`() {
        stubSetting("pin", "1234")
        val token = UUID.randomUUID()
        every { pinSessionService.createSession() } returns token
        assertThat(service.verifyPin("1234")).isEqualTo(token.toString())
    }

    @Test
    fun `changePin rejects wrong current pin`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.changePin("0000", "5678") }
            .isInstanceOf(InvalidPinException::class.java)
    }

    @Test
    fun `changePin rejects bad new format`() {
        stubSetting("pin", "1234")
        assertThatThrownBy { service.changePin("1234", "12") }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `changePin stores new pin`() {
        stubSetting("pin", "1234")
        service.changePin("1234", "5678")
        verify { settingRepository.save(match { it.key == "pin" && it.value == "5678" }) }
    }

    @Test
    fun `changePin rejects when no pin set`() {
        stubSetting("pin", null)
        assertThatThrownBy { service.changePin("1234", "5678") }
            .isInstanceOf(InvalidPinException::class.java)
    }
}
