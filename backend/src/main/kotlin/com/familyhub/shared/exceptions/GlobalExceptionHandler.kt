package com.familyhub.shared.exceptions

import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.servlet.resource.NoResourceFoundException
import java.util.UUID

@RestControllerAdvice
class GlobalExceptionHandler {

    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(NoResourceFoundException::class)
    fun handleNotFound(ex: NoResourceFoundException): ResponseEntity<ErrorResponse> {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            ErrorResponse(code = "NOT_FOUND", message = "Ressource nicht gefunden")
        )
    }

    @ExceptionHandler(SetupAlreadyCompletedException::class)
    fun handleSetupCompleted(ex: SetupAlreadyCompletedException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(
            ErrorResponse(code = "SETUP_COMPLETED", message = ex.message)
        )

    @ExceptionHandler(InvalidPinException::class)
    fun handleInvalidPin(ex: InvalidPinException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
            ErrorResponse(code = "INVALID_PIN", message = ex.message)
        )

    @ExceptionHandler(ValidationException::class)
    fun handleValidation(ex: ValidationException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ErrorResponse(code = "VALIDATION_ERROR", message = ex.message)
        )

    @ExceptionHandler(MemberNotFoundException::class)
    fun handleMemberNotFound(ex: MemberNotFoundException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(
            ErrorResponse(code = "NOT_FOUND", message = ex.message)
        )

    @ExceptionHandler(PayloadTooLargeException::class)
    fun handlePayloadTooLarge(ex: PayloadTooLargeException): ResponseEntity<ErrorResponse> =
        ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(
            ErrorResponse(code = "PAYLOAD_TOO_LARGE", message = ex.message)
        )

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleBeanValidation(ex: MethodArgumentNotValidException): ResponseEntity<ErrorResponse> {
        val firstError = ex.bindingResult.fieldErrors.firstOrNull()
        val detail = if (firstError != null) {
            "${firstError.field}: ${firstError.defaultMessage}"
        } else {
            "Ungültige Anfrage"
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
            ErrorResponse(code = "VALIDATION_ERROR", message = detail)
        )
    }

    @ExceptionHandler(Exception::class)
    fun handleGeneric(ex: Exception): ResponseEntity<ErrorResponse> {
        val correlationId = UUID.randomUUID().toString()
        log.error("Unhandled exception [correlationId={}]", correlationId, ex)
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
            ErrorResponse(
                code = "INTERNAL_ERROR",
                message = "Ein interner Fehler ist aufgetreten",
                correlationId = correlationId,
            )
        )
    }
}
