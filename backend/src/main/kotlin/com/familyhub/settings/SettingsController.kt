package com.familyhub.settings

import com.familyhub.generated.api.SettingsApi
import com.familyhub.generated.model.ChangePinRequest
import com.familyhub.generated.model.SessionTokenResponse
import com.familyhub.generated.model.SetPinRequest
import com.familyhub.generated.model.SetupStatusResponse
import com.familyhub.generated.model.SetupStepRequest
import com.familyhub.generated.model.VerifyPinRequest
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class SettingsController(
    private val settingsService: SettingsService,
) : SettingsApi {

    override fun getSetupStatus(): ResponseEntity<SetupStatusResponse> =
        ResponseEntity.ok(settingsService.getSetupStatus())

    override fun updateSetupStep(setupStepRequest: SetupStepRequest): ResponseEntity<Unit> {
        settingsService.updateSetupStep(setupStepRequest.step)
        return ResponseEntity.noContent().build()
    }

    override fun setPin(setPinRequest: SetPinRequest): ResponseEntity<SessionTokenResponse> =
        ResponseEntity.ok(SessionTokenResponse(sessionToken = UUID.fromString(settingsService.setPin(setPinRequest.pin))))

    override fun verifyPin(verifyPinRequest: VerifyPinRequest): ResponseEntity<SessionTokenResponse> =
        ResponseEntity.ok(SessionTokenResponse(sessionToken = UUID.fromString(settingsService.verifyPin(verifyPinRequest.pin))))

    @RequiresPinSession
    override fun changePin(changePinRequest: ChangePinRequest): ResponseEntity<Unit> {
        settingsService.changePin(changePinRequest.currentPin, changePinRequest.newPin)
        return ResponseEntity.noContent().build()
    }
}
