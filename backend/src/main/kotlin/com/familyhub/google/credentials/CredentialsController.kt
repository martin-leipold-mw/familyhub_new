package com.familyhub.google.credentials

import com.familyhub.generated.api.GoogleCredentialsApi
import com.familyhub.generated.model.CredentialsValidationRequest
import com.familyhub.generated.model.CredentialsValidationResponse
import com.familyhub.generated.model.GoogleCredentialsRequest
import com.familyhub.generated.model.GoogleCredentialsResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class CredentialsController(
    private val service: CredentialsService,
) : GoogleCredentialsApi {
    @RequiresPinSession
    override fun listCredentials(): ResponseEntity<List<GoogleCredentialsResponse>> =
        ResponseEntity.ok(service.list().map { it.toResponse() })

    @RequiresPinSession
    override fun createCredentials(googleCredentialsRequest: GoogleCredentialsRequest): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(service.create(googleCredentialsRequest.toCommand()).toResponse())

    @RequiresPinSession
    override fun getCredentials(id: UUID): ResponseEntity<GoogleCredentialsResponse> = ResponseEntity.ok(service.get(id).toResponse())

    @RequiresPinSession
    override fun updateCredentials(
        id: UUID,
        googleCredentialsRequest: GoogleCredentialsRequest,
    ): ResponseEntity<GoogleCredentialsResponse> = ResponseEntity.ok(service.update(id, googleCredentialsRequest.toCommand()).toResponse())

    @RequiresPinSession
    override fun deleteCredentials(id: UUID): ResponseEntity<Unit> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }

    @RequiresPinSession
    override fun setPrimaryCredentials(id: UUID): ResponseEntity<GoogleCredentialsResponse> =
        ResponseEntity.ok(service.setPrimary(id).toResponse())

    @RequiresPinSession
    override fun validateCredentials(
        credentialsValidationRequest: CredentialsValidationRequest,
    ): ResponseEntity<CredentialsValidationResponse> {
        val r =
            service.validate(
                credentialsValidationRequest.clientId,
                credentialsValidationRequest.clientSecret,
                credentialsValidationRequest.redirectUri,
            )
        return ResponseEntity.ok(CredentialsValidationResponse(isValid = r.isValid, message = r.message))
    }

    private fun GoogleCredentialsRequest.toCommand() = CredentialsCommand(nickname, clientId ?: "", clientSecret ?: "", redirectUri)

    private fun GoogleCredentialsView.toResponse() =
        GoogleCredentialsResponse(
            id = id,
            nickname = nickname,
            redirectUri = redirectUri,
            isPrimary = isPrimary,
            isActive = isActive,
        )
}
