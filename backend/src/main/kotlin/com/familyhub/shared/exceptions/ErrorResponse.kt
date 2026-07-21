package com.familyhub.shared.exceptions

import java.util.UUID

data class ErrorResponse(
    val code: String,
    val message: String,
    val correlationId: String = UUID.randomUUID().toString(),
)
