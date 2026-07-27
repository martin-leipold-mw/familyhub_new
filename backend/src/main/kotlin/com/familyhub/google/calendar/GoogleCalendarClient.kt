package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.token.GoogleTokenProvider
import com.google.api.client.googleapis.json.GoogleJsonResponseException
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.client.util.DateTime
import com.google.api.services.calendar.Calendar
import com.google.api.services.calendar.model.Event
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

data class GoogleCalendarInfo(
    val id: String,
    val summary: String,
    val backgroundColor: String?,
    val primary: Boolean,
)

data class EventPage(
    val events: List<Event>,
    val nextSyncToken: String?,
    val fullResyncRequired: Boolean,
)

@Component
class GoogleCalendarClient(
    private val tokenProvider: GoogleTokenProvider,
    private val transport: NetHttpTransport,
    @Value("\${google.api-base-url:https://www.googleapis.com/}") private val baseUrl: String,
) {
    private fun buildCalendar(connection: GoogleConnection): Calendar {
        val token = tokenProvider.validAccessToken(connection)
        val initializer =
            com.google.api.client.http.HttpRequestInitializer { request ->
                request.headers.authorization = "Bearer $token"
                request.connectTimeout = 5_000
                request.readTimeout = 30_000
            }
        return Calendar.Builder(transport, GsonFactory.getDefaultInstance(), initializer)
            .setApplicationName("FamilyHub")
            .setRootUrl(baseUrl)
            .build()
    }

    fun listCalendars(connection: GoogleConnection): List<GoogleCalendarInfo> {
        val calendar = buildCalendar(connection)
        val result = mutableListOf<GoogleCalendarInfo>()
        var pageToken: String? = null
        do {
            val request =
                calendar.calendarList().list()
                    .also { req -> pageToken?.let { req.pageToken = it } }
            val response = request.execute()
            response.items?.forEach { entry ->
                result +=
                    GoogleCalendarInfo(
                        id = entry.id,
                        summary = entry.summary ?: "",
                        backgroundColor = entry.backgroundColor,
                        primary = entry.isPrimary == true,
                    )
            }
            pageToken = response.nextPageToken
        } while (pageToken != null)
        return result
    }

    fun listEvents(
        connection: GoogleConnection,
        calendarId: String,
        syncToken: String?,
        timeMin: DateTime?,
        timeMax: DateTime?,
    ): EventPage {
        val calendar = buildCalendar(connection)
        try {
            val allEvents = mutableListOf<Event>()
            var pageToken: String? = null
            var capturedSyncToken: String? = null
            do {
                val request =
                    calendar.events().list(calendarId)
                        .setSingleEvents(true)
                        .setShowDeleted(true)
                if (syncToken != null) {
                    request.syncToken = syncToken
                } else {
                    if (timeMin != null) request.timeMin = timeMin
                    if (timeMax != null) request.timeMax = timeMax
                }
                if (pageToken != null) {
                    request.pageToken = pageToken
                }
                val response = request.execute()
                response.items?.let { allEvents.addAll(it) }
                capturedSyncToken = response.nextSyncToken ?: capturedSyncToken
                pageToken = response.nextPageToken
            } while (pageToken != null)
            return EventPage(
                events = allEvents,
                nextSyncToken = capturedSyncToken,
                fullResyncRequired = false,
            )
        } catch (ex: GoogleJsonResponseException) {
            if (ex.statusCode == 410) {
                return EventPage(events = emptyList(), nextSyncToken = null, fullResyncRequired = true)
            }
            throw ex
        }
    }

    fun insertEvent(
        connection: GoogleConnection,
        calendarId: String,
        googleEvent: Event,
    ): Event {
        return buildCalendar(connection).events().insert(calendarId, googleEvent).execute()
    }

    fun updateEvent(
        connection: GoogleConnection,
        calendarId: String,
        googleEvent: Event,
    ): Event {
        return buildCalendar(connection).events().update(calendarId, googleEvent.id, googleEvent).execute()
    }

    fun deleteEvent(
        connection: GoogleConnection,
        calendarId: String,
        eventId: String,
    ) {
        buildCalendar(connection).events().delete(calendarId, eventId).execute()
    }
}
