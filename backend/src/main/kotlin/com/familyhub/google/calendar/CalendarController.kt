package com.familyhub.google.calendar

import com.familyhub.generated.api.GoogleCalendarsApi
import com.familyhub.generated.model.CalendarResponse
import com.familyhub.generated.model.SelectedCalendarsRequest
import com.familyhub.generated.model.SyncResultResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class CalendarController(
    private val service: CalendarQueryService,
) : GoogleCalendarsApi {
    override fun listGoogleCalendars(memberId: UUID): ResponseEntity<List<CalendarResponse>> =
        ResponseEntity.ok(service.listForMember(memberId).map { it.toResponse() })

    @RequiresPinSession
    override fun saveSelectedCalendars(selectedCalendarsRequest: SelectedCalendarsRequest): ResponseEntity<Unit> {
        service.saveSelection(selectedCalendarsRequest.memberId, selectedCalendarsRequest.calendarIds)
        return ResponseEntity.ok().build()
    }

    override fun syncCalendars(memberId: UUID): ResponseEntity<SyncResultResponse> {
        val r = service.syncForMember(memberId)
        return ResponseEntity.ok(SyncResultResponse(created = r.created, updated = r.updated, deleted = r.deleted))
    }
}

private fun CalendarView.toResponse() =
    CalendarResponse(
        id = id,
        summary = summary,
        backgroundColor = backgroundColor,
        isPrimary = isPrimary,
        isSelected = isSelected,
    )
