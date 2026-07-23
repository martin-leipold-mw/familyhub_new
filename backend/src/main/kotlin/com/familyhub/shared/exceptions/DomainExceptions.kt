package com.familyhub.shared.exceptions

// `message` is overridden as non-null so the exception handlers can read it
// directly without an elvis fallback: every instance always carries a message,
// so a `?:` default would be an unreachable (untestable) branch.

class SetupAlreadyCompletedException(
    override val message: String = "Setup ist bereits abgeschlossen",
) : RuntimeException(message)

class InvalidPinException(
    override val message: String = "PIN ist ungültig",
) : RuntimeException(message)

class ValidationException(
    override val message: String,
) : RuntimeException(message)

class MemberNotFoundException(
    override val message: String = "Mitglied nicht gefunden",
) : RuntimeException(message)

class PayloadTooLargeException(
    override val message: String = "Das Bild ist zu groß für den Server",
) : RuntimeException(message)

class ResourceNotFoundException(
    override val message: String,
) : RuntimeException(message)

class GoogleConnectionRevokedException(
    override val message: String = "Google-Verbindung abgelaufen. Bitte neu verbinden.",
) : RuntimeException(message)
