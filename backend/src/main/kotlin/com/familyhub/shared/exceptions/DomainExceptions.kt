package com.familyhub.shared.exceptions

class SetupAlreadyCompletedException : RuntimeException("Setup ist bereits abgeschlossen")

class InvalidPinException : RuntimeException("PIN ist ungültig")

class ValidationException(message: String) : RuntimeException(message)

class MemberNotFoundException : RuntimeException("Mitglied nicht gefunden")

class PayloadTooLargeException : RuntimeException("Das Bild ist zu groß für den Server")
