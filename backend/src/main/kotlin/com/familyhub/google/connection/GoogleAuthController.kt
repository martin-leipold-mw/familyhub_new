package com.familyhub.google.connection

import com.familyhub.generated.api.GoogleAuthApi
import com.familyhub.generated.model.AuthUrlResponse
import com.familyhub.generated.model.ConnectionResponse
import com.familyhub.generated.model.OAuthCallbackRequest
import com.familyhub.generated.model.OAuthCallbackResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class GoogleAuthController(
    private val service: ConnectionService,
) : GoogleAuthApi {
    override fun authorizeGoogle(
        credentialsId: UUID?,
        returnUrl: String?,
        @Suppress("UNUSED_PARAMETER") memberId: UUID?,
    ): ResponseEntity<AuthUrlResponse> =
        // Temporary shim: matches the regenerated 3-param GoogleAuthApi interface so the backend
        // compiles through Phase D tasks D2/D3. Task D4 wires memberId into startAuthorization.
        ResponseEntity.ok(AuthUrlResponse(authUrl = service.startAuthorization(credentialsId, returnUrl ?: "/")))

    override fun googleCallback(oauthCallbackRequest: OAuthCallbackRequest): ResponseEntity<OAuthCallbackResponse> {
        val r = service.handleCallback(oauthCallbackRequest.code, oauthCallbackRequest.state)
        return ResponseEntity.ok(
            OAuthCallbackResponse(
                memberId = r.memberId,
                memberName = r.memberName,
                isNewMember = r.isNewMember,
                returnUrl = r.returnUrl,
            ),
        )
    }

    override fun listConnections(): ResponseEntity<List<ConnectionResponse>> =
        ResponseEntity.ok(
            service.listConnections().map {
                ConnectionResponse(
                    connectionId = it.connectionId,
                    memberId = it.memberId,
                    email = it.email,
                    name = it.name,
                    status = it.status,
                    lastSyncedAt = it.lastSyncedAt?.let { t -> t.toString() },
                    scopes = it.scopes,
                )
            },
        )

    @RequiresPinSession
    override fun disconnectConnection(id: UUID): ResponseEntity<Unit> {
        service.disconnect(id)
        return ResponseEntity.ok().build()
    }

    @RequiresPinSession
    override fun refreshConnection(id: UUID): ResponseEntity<Unit> {
        service.refreshConnection(id)
        return ResponseEntity.ok().build()
    }
}
