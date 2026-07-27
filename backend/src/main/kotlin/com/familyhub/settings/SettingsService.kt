package com.familyhub.settings

import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.google.calendar.CalendarSubscriptionRepository
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.credentials.GoogleCredentialsRepository
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.pin.PinSessionService
import com.familyhub.shared.exceptions.InvalidPinException
import com.familyhub.shared.exceptions.SetupAlreadyCompletedException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SettingsService(
    private val settingRepository: SettingRepository,
    private val memberRepository: FamilyMemberRepository,
    private val pinSessionService: PinSessionService,
    private val googleCredentialsRepository: GoogleCredentialsRepository,
    private val googleConnectionRepository: GoogleConnectionRepository,
    private val calendarSubscriptionRepository: CalendarSubscriptionRepository,
) {
    fun getSetupStatus(): SetupStatusResponse {
        val hasFamilyMembers = memberRepository.countByIsActiveTrue() > 0
        val hasCredentials = googleCredentialsRepository.count() > 0
        val hasConnection = googleConnectionRepository.findAllByStatus("active").isNotEmpty()
        val hasSelectedCalendars = calendarSubscriptionRepository.existsByIsSelectedTrue()
        val hasPin = getValue(KEY_PIN) != null
        return SetupStatusResponse(
            setupCompleted = getValue(KEY_SETUP_COMPLETED) == "true",
            currentStep = computeStep(hasFamilyMembers, hasCredentials, hasConnection, hasSelectedCalendars, hasPin),
            hasFamilyMembers = hasFamilyMembers,
            hasPin = hasPin,
            hasCredentials = hasCredentials,
            hasConnection = hasConnection,
            hasSelectedCalendars = hasSelectedCalendars,
        )
    }

    private fun computeStep(
        hasMembers: Boolean,
        hasCredentials: Boolean,
        hasConnection: Boolean,
        hasSelectedCalendars: Boolean,
        hasPin: Boolean,
    ): Int =
        when {
            !hasMembers -> 2
            !hasCredentials -> 3
            !hasConnection -> 5
            !hasSelectedCalendars -> 6
            !hasPin -> 7
            else -> 7
        }

    @Transactional
    fun updateSetupStep(step: Int) {
        requireSetupNotCompleted()
        if (step !in 1..7) throw ValidationException("Ungültiger Schritt")
        setValue(KEY_SETUP_STEP, step.toString())
    }

    @Transactional
    fun setPin(pin: String): String {
        requireSetupNotCompleted()
        validatePinFormat(pin)
        setValue(KEY_PIN, pin)
        setValue(KEY_SETUP_COMPLETED, "true")
        return pinSessionService.createSession().toString()
    }

    fun verifyPin(pin: String): String {
        val stored = getValue(KEY_PIN) ?: throw InvalidPinException()
        if (stored != pin) throw InvalidPinException()
        return pinSessionService.createSession().toString()
    }

    @Transactional
    fun changePin(
        currentPin: String,
        newPin: String,
    ) {
        val stored = getValue(KEY_PIN) ?: throw InvalidPinException()
        if (stored != currentPin) throw InvalidPinException()
        validatePinFormat(newPin)
        setValue(KEY_PIN, newPin)
    }

    private fun requireSetupNotCompleted() {
        if (getValue(KEY_SETUP_COMPLETED) == "true") throw SetupAlreadyCompletedException()
    }

    private fun validatePinFormat(pin: String) {
        if (!pin.matches(Regex("^\\d{4,6}$"))) {
            throw ValidationException("PIN muss 4 bis 6 Ziffern enthalten")
        }
    }

    private fun getValue(key: String): String? = settingRepository.findById(key).map { it.value }.orElse(null)

    private fun setValue(
        key: String,
        value: String,
    ) {
        val setting = settingRepository.findById(key).orElse(Setting(key = key, value = value))
        setting.value = value
        settingRepository.save(setting)
    }

    fun setGoogleConnected(value: Boolean) = setValue(KEY_GOOGLE_CONNECTED, value.toString())

    fun timezone(): String = getValue(KEY_TIMEZONE) ?: "Europe/Berlin"

    fun syncIntervalMinutes(): Long = getValue(KEY_SYNC_INTERVAL)?.toLongOrNull() ?: 15

    companion object {
        const val KEY_PIN = "pin"
        const val KEY_SETUP_COMPLETED = "setup.completed"
        const val KEY_SETUP_STEP = "setup.step"
        const val KEY_GOOGLE_CONNECTED = "google.connected"
        const val KEY_TIMEZONE = "family.timezone"
        const val KEY_SYNC_INTERVAL = "google.sync.interval.minutes"
    }
}
