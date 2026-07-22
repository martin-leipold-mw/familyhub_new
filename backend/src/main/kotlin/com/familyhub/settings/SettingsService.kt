package com.familyhub.settings

import com.familyhub.generated.model.SetupStatusResponse
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
) {

    fun getSetupStatus(): SetupStatusResponse = SetupStatusResponse(
        setupCompleted = getValue(KEY_SETUP_COMPLETED) == "true",
        currentStep = getValue(KEY_SETUP_STEP)?.toIntOrNull() ?: 1,
        hasFamilyMembers = memberRepository.countByIsActiveTrue() > 0,
        hasPin = getValue(KEY_PIN) != null,
    )

    @Transactional
    fun updateSetupStep(step: Int) {
        requireSetupNotCompleted()
        if (step !in 1..3) throw ValidationException("Ungültiger Schritt")
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
    fun changePin(currentPin: String, newPin: String) {
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

    private fun getValue(key: String): String? =
        settingRepository.findById(key).map { it.value }.orElse(null)

    private fun setValue(key: String, value: String) {
        val setting = settingRepository.findById(key).orElse(Setting(key = key, value = value))
        setting.value = value
        settingRepository.save(setting)
    }

    companion object {
        const val KEY_PIN = "pin"
        const val KEY_SETUP_COMPLETED = "setup.completed"
        const val KEY_SETUP_STEP = "setup.step"
    }
}
