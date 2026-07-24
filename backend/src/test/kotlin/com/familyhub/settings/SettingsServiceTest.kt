package com.familyhub.settings

import com.familyhub.google.calendar.CalendarSubscriptionRepository
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.GoogleCredentialsRepository
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
    private val googleCredentialsRepository = mockk<GoogleCredentialsRepository>(relaxed = true)
    private val googleConnectionRepository = mockk<GoogleConnectionRepository>(relaxed = true)
    private val calendarSubscriptionRepository = mockk<CalendarSubscriptionRepository>(relaxed = true)
    private val service = SettingsService(
        settingRepository,
        memberRepository,
        pinSessionService,
        googleCredentialsRepository,
        googleConnectionRepository,
        calendarSubscriptionRepository,
    )

    init {
        every { settingRepository.save(ofType()) } answers { firstArg() }
    }

    private fun stubSetting(key: String, value: String?) {
        every { settingRepository.findById(key) } returns
            (value?.let { Optional.of(Setting(key = key, value = it)) } ?: Optional.empty())
    }

    /** Default stubs so tests that don't care about the Google repos get safe defaults */
    private fun stubGoogleDefaults() {
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false
    }

    // ── getSetupStatus: basic fields ────────────────────────────────────────

    @Test
    fun `getSetupStatus reflects stored keys and member count`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L
        stubGoogleDefaults()

        val status = service.getSetupStatus()
        assertThat(status.setupCompleted).isFalse()
        assertThat(status.hasFamilyMembers).isTrue()
        assertThat(status.hasPin).isFalse()
    }

    @Test
    fun `getSetupStatus reports hasPin true when pin setting present`() {
        stubSetting("setup.completed", "true")
        stubSetting("pin", "1234")
        every { memberRepository.countByIsActiveTrue() } returns 0L
        stubGoogleDefaults()

        val status = service.getSetupStatus()
        assertThat(status.hasPin).isTrue()
        assertThat(status.hasFamilyMembers).isFalse()
    }

    // ── getSetupStatus: new boolean fields ──────────────────────────────────

    @Test
    fun `getSetupStatus hasCredentials true when credentials exist`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 1L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().hasCredentials).isTrue()
    }

    @Test
    fun `getSetupStatus hasCredentials false when no credentials`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().hasCredentials).isFalse()
    }

    @Test
    fun `getSetupStatus hasConnection true when active connection exists`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns listOf(mockk())
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().hasConnection).isTrue()
    }

    @Test
    fun `getSetupStatus hasConnection false when no active connection`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().hasConnection).isFalse()
    }

    @Test
    fun `getSetupStatus hasSelectedCalendars true when a subscription is selected`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns true

        assertThat(service.getSetupStatus().hasSelectedCalendars).isTrue()
    }

    @Test
    fun `getSetupStatus hasSelectedCalendars false when no subscription is selected`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().hasSelectedCalendars).isFalse()
    }

    // ── computeStep branch coverage via getSetupStatus.currentStep ──────────

    @Test
    fun `computeStep returns 2 when no members`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 0L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().currentStep).isEqualTo(2)
    }

    @Test
    fun `computeStep returns 3 when members but no credentials`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L
        every { googleCredentialsRepository.count() } returns 0L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().currentStep).isEqualTo(3)
    }

    @Test
    fun `computeStep returns 5 when members and credentials but no connection`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L
        every { googleCredentialsRepository.count() } returns 1L
        every { googleConnectionRepository.findAllByStatus("active") } returns emptyList()
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().currentStep).isEqualTo(5)
    }

    @Test
    fun `computeStep returns 6 when members, credentials, connection but no selected calendars`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L
        every { googleCredentialsRepository.count() } returns 1L
        every { googleConnectionRepository.findAllByStatus("active") } returns listOf(mockk())
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns false

        assertThat(service.getSetupStatus().currentStep).isEqualTo(6)
    }

    @Test
    fun `computeStep returns 7 when members, credentials, connection, calendars but no pin`() {
        stubSetting("setup.completed", "false")
        stubSetting("pin", null)
        every { memberRepository.countByIsActiveTrue() } returns 1L
        every { googleCredentialsRepository.count() } returns 1L
        every { googleConnectionRepository.findAllByStatus("active") } returns listOf(mockk())
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns true

        assertThat(service.getSetupStatus().currentStep).isEqualTo(7)
    }

    @Test
    fun `computeStep returns 7 when all conditions met`() {
        stubSetting("setup.completed", "true")
        stubSetting("pin", "1234")
        every { memberRepository.countByIsActiveTrue() } returns 1L
        every { googleCredentialsRepository.count() } returns 1L
        every { googleConnectionRepository.findAllByStatus("active") } returns listOf(mockk())
        every { calendarSubscriptionRepository.existsByIsSelectedTrue() } returns true

        assertThat(service.getSetupStatus().currentStep).isEqualTo(7)
    }

    // ── updateSetupStep ──────────────────────────────────────────────────────

    @Test
    fun `updateSetupStep rejects when setup already completed`() {
        stubSetting("setup.completed", "true")
        assertThatThrownBy { service.updateSetupStep(2) }
            .isInstanceOf(SetupAlreadyCompletedException::class.java)
    }

    @Test
    fun `updateSetupStep rejects step 8 above upper bound`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.updateSetupStep(8) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `updateSetupStep rejects step 0 below lower bound`() {
        stubSetting("setup.completed", "false")
        assertThatThrownBy { service.updateSetupStep(0) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `updateSetupStep accepts step 7`() {
        stubSetting("setup.completed", "false")
        stubSetting("setup.step", "6")
        service.updateSetupStep(7)
        verify { settingRepository.save(match { it.key == "setup.step" && it.value == "7" }) }
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

    // ── PIN operations ───────────────────────────────────────────────────────

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

    // ── timezone() coverage ──────────────────────────────────────────────────

    @Test
    fun `timezone returns DB value when family timezone is set`() {
        stubSetting("family.timezone", "Europe/London")
        assertThat(service.timezone()).isEqualTo("Europe/London")
    }

    @Test
    fun `timezone returns default Europe Berlin when setting is absent`() {
        stubSetting("family.timezone", null)
        assertThat(service.timezone()).isEqualTo("Europe/Berlin")
    }

    // ── syncIntervalMinutes() coverage ───────────────────────────────────────

    @Test
    fun `syncIntervalMinutes returns parsed DB value when set`() {
        stubSetting("google.sync.interval.minutes", "30")
        assertThat(service.syncIntervalMinutes()).isEqualTo(30L)
    }

    @Test
    fun `syncIntervalMinutes returns default 15 when setting is absent`() {
        stubSetting("google.sync.interval.minutes", null)
        assertThat(service.syncIntervalMinutes()).isEqualTo(15L)
    }

    @Test
    fun `syncIntervalMinutes returns default 15 when value is non-numeric`() {
        stubSetting("google.sync.interval.minutes", "abc")
        assertThat(service.syncIntervalMinutes()).isEqualTo(15L)
    }
}
