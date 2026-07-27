package com.familyhub.shared.health

import com.familyhub.generated.api.SystemApi
import com.familyhub.generated.model.HealthResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.time.ZoneOffset

@RestController
@RequestMapping("/api")
class HealthController(
    @Value("\${familyhub.version:dev}") private val version: String,
) : SystemApi {
    override fun getHealth(): ResponseEntity<HealthResponse> {
        return ResponseEntity.ok(
            HealthResponse(
                status = HealthResponse.Status.UP,
                timestamp = OffsetDateTime.now(ZoneOffset.UTC),
                version = version,
            ),
        )
    }
}
