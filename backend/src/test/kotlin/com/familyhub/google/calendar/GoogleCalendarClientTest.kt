package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.token.GoogleTokenProvider
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.*
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.services.calendar.model.Event
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

/**
 * WireMock-based tests for GoogleCalendarClient.
 *
 * URL note: The Google Calendar SDK sends calendarId in the path WITHOUT percent-encoding
 * the '@' character (it sends `/calendar/v3/calendars/primary@gmail.com/events`).
 * WireMock path matching uses the raw path from the incoming request, so stubs must use
 * the literal '@' — not '%40'.
 */
class GoogleCalendarClientTest {

    private lateinit var wm: WireMockServer
    private lateinit var client: GoogleCalendarClient
    private val tokenProvider = mockk<GoogleTokenProvider>()
    private val connection = GoogleConnection(
        familyMemberId = UUID.randomUUID(),
        credentialsId = null,
        googleAccountId = "g123",
        email = "test@example.com",
        accessToken = "enc_token",
        refreshToken = "enc_refresh",
        tokenExpiresAt = null,
    )

    @BeforeEach
    fun setUp() {
        wm = WireMockServer(options().dynamicPort())
        wm.start()
        every { tokenProvider.validAccessToken(any()) } returns "test-bearer-token"
        // baseUrl must end with "/" — Calendar SDK appends "calendar/v3/..."
        client = GoogleCalendarClient(tokenProvider, NetHttpTransport(), wm.baseUrl() + "/")
    }

    @AfterEach
    fun tearDown() = wm.stop()

    // ─── listCalendars: two pages ────────────────────────────────────────────

    @Test
    fun `listCalendars follows pagination over two pages and maps all fields`() {
        // Page 1: one primary calendar with backgroundColor, plus nextPageToken
        wm.stubFor(
            get(urlPathEqualTo("/calendar/v3/users/me/calendarList"))
                .withQueryParam("pageToken", absent())
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#calendarList",
                          "items": [
                            {
                              "id": "primary@gmail.com",
                              "summary": "Papa Kalender",
                              "backgroundColor": "#1a73e8",
                              "primary": true
                            }
                          ],
                          "nextPageToken": "page2token"
                        }
                        """.trimIndent()
                    )
                )
        )
        // Page 2: non-primary calendar without backgroundColor — no nextPageToken (loop ends)
        wm.stubFor(
            get(urlPathEqualTo("/calendar/v3/users/me/calendarList"))
                .withQueryParam("pageToken", equalTo("page2token"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#calendarList",
                          "items": [
                            {
                              "id": "family@group.calendar.google.com",
                              "summary": "Familie"
                            }
                          ]
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listCalendars(connection)

        assertThat(result).hasSize(2)

        val primary = result.first { it.id == "primary@gmail.com" }
        assertThat(primary.summary).isEqualTo("Papa Kalender")
        assertThat(primary.backgroundColor).isEqualTo("#1a73e8")
        assertThat(primary.primary).isTrue()

        // non-primary calendar without backgroundColor → null
        val family = result.first { it.id == "family@group.calendar.google.com" }
        assertThat(family.summary).isEqualTo("Familie")
        assertThat(family.backgroundColor).isNull()
        assertThat(family.primary).isFalse()
    }

    @Test
    fun `listCalendars handles single page with no nextPageToken`() {
        wm.stubFor(
            get(urlPathEqualTo("/calendar/v3/users/me/calendarList"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#calendarList",
                          "items": [
                            {
                              "id": "only@gmail.com",
                              "summary": "Only Calendar",
                              "primary": true
                            }
                          ]
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listCalendars(connection)
        assertThat(result).hasSize(1)
        assertThat(result[0].id).isEqualTo("only@gmail.com")
        assertThat(result[0].primary).isTrue()
        assertThat(result[0].backgroundColor).isNull()
    }

    // ─── listEvents: pagination + syncToken captured ─────────────────────────

    @Test
    fun `listEvents collects all pages and captures nextSyncToken from last page`() {
        // The Google SDK sends calendarId in path without encoding '@'
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        // Page 1: has nextPageToken but no nextSyncToken yet
        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .withQueryParam("pageToken", absent())
                .withQueryParam("singleEvents", equalTo("true"))
                .withQueryParam("showDeleted", equalTo("true"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#events",
                          "items": [
                            {
                              "id": "event1",
                              "summary": "Geburtstag",
                              "status": "confirmed"
                            }
                          ],
                          "nextPageToken": "eventsPage2"
                        }
                        """.trimIndent()
                    )
                )
        )
        // Page 2: has nextSyncToken, no nextPageToken (loop ends)
        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .withQueryParam("pageToken", equalTo("eventsPage2"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#events",
                          "items": [
                            {
                              "id": "event2",
                              "summary": "Arzttermin",
                              "status": "confirmed"
                            }
                          ],
                          "nextSyncToken": "sync-token-abc123"
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listEvents(connection, "primary@gmail.com", null, null, null)

        assertThat(result.fullResyncRequired).isFalse()
        assertThat(result.nextSyncToken).isEqualTo("sync-token-abc123")
        assertThat(result.events).hasSize(2)
        assertThat(result.events.map { it.id }).containsExactly("event1", "event2")
    }

    @Test
    fun `listEvents with syncToken passes it as query param and returns non-fullResync`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .withQueryParam("syncToken", equalTo("my-sync-token"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#events",
                          "items": [],
                          "nextSyncToken": "new-sync-token"
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listEvents(connection, "primary@gmail.com", "my-sync-token", null, null)

        assertThat(result.fullResyncRequired).isFalse()
        assertThat(result.nextSyncToken).isEqualTo("new-sync-token")
        assertThat(result.events).isEmpty()
    }

    // ─── listEvents: HTTP 410 → fullResyncRequired ───────────────────────────

    @Test
    fun `listEvents returns fullResyncRequired=true on HTTP 410`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .willReturn(
                    aResponse()
                        .withStatus(410)
                        .withHeader("Content-Type", "application/json; charset=UTF-8")
                        .withBody(
                            """
                            {
                              "error": {
                                "code": 410,
                                "message": "Sync token is no longer valid, a full sync is required.",
                                "errors": [{"domain":"calendar","reason":"fullSyncRequired"}]
                              }
                            }
                            """.trimIndent()
                        )
                )
        )

        val result = client.listEvents(connection, "primary@gmail.com", "stale-sync-token", null, null)

        assertThat(result.fullResyncRequired).isTrue()
        assertThat(result.events).isEmpty()
        assertThat(result.nextSyncToken).isNull()
    }

    @Test
    fun `listEvents rethrows non-410 GoogleJsonResponseException`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .willReturn(
                    aResponse()
                        .withStatus(403)
                        .withHeader("Content-Type", "application/json; charset=UTF-8")
                        .withBody(
                            """
                            {
                              "error": {
                                "code": 403,
                                "message": "Access denied.",
                                "errors": [{"domain":"calendar","reason":"forbidden"}]
                              }
                            }
                            """.trimIndent()
                        )
                )
        )

        assertThatThrownBy {
            client.listEvents(connection, "primary@gmail.com", null, null, null)
        }.isInstanceOf(com.google.api.client.googleapis.json.GoogleJsonResponseException::class.java)
    }

    // ─── insertEvent ─────────────────────────────────────────────────────────

    @Test
    fun `insertEvent posts event and returns parsed response`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            post(urlPathEqualTo(calendarPath))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#event",
                          "id": "new-event-id",
                          "summary": "Neuer Termin",
                          "status": "confirmed"
                        }
                        """.trimIndent()
                    )
                )
        )

        val newEvent = Event().setSummary("Neuer Termin")
        val result = client.insertEvent(connection, "primary@gmail.com", newEvent)

        assertThat(result.id).isEqualTo("new-event-id")
        assertThat(result.summary).isEqualTo("Neuer Termin")
        assertThat(result.status).isEqualTo("confirmed")
    }

    // ─── updateEvent ─────────────────────────────────────────────────────────

    @Test
    fun `updateEvent puts event and returns updated response`() {
        val eventId = "existing-event-id"
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events/$eventId"

        wm.stubFor(
            put(urlPathEqualTo(calendarPath))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#event",
                          "id": "$eventId",
                          "summary": "Aktualisierter Termin",
                          "status": "confirmed"
                        }
                        """.trimIndent()
                    )
                )
        )

        val updatedEvent = Event().setId(eventId).setSummary("Aktualisierter Termin")
        val result = client.updateEvent(connection, "primary@gmail.com", updatedEvent)

        assertThat(result.id).isEqualTo(eventId)
        assertThat(result.summary).isEqualTo("Aktualisierter Termin")
    }

    // ─── deleteEvent ─────────────────────────────────────────────────────────

    @Test
    fun `deleteEvent sends DELETE request without throwing`() {
        val eventId = "event-to-delete"
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events/$eventId"

        wm.stubFor(
            delete(urlPathEqualTo(calendarPath))
                .willReturn(aResponse().withStatus(204))
        )

        // Must not throw
        client.deleteEvent(connection, "primary@gmail.com", eventId)

        wm.verify(deleteRequestedFor(urlPathEqualTo(calendarPath)))
    }

    // ─── listEvents with timeMin/timeMax (null syncToken path) ───────────────

    @Test
    fun `listEvents passes timeMin and timeMax when syncToken is null`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .withQueryParam("timeMin", equalTo("2026-01-01T00:00:00.000Z"))
                .withQueryParam("timeMax", equalTo("2026-12-31T23:59:59.000Z"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#events",
                          "items": [],
                          "nextSyncToken": "new-sync-token-timerange"
                        }
                        """.trimIndent()
                    )
                )
        )

        val timeMin = com.google.api.client.util.DateTime("2026-01-01T00:00:00.000Z")
        val timeMax = com.google.api.client.util.DateTime("2026-12-31T23:59:59.000Z")
        val result = client.listEvents(connection, "primary@gmail.com", null, timeMin, timeMax)

        assertThat(result.fullResyncRequired).isFalse()
        assertThat(result.nextSyncToken).isEqualTo("new-sync-token-timerange")
        assertThat(result.events).isEmpty()
    }

    // ─── listCalendars with null items in response ────────────────────────────

    @Test
    fun `listCalendars handles response with null items gracefully`() {
        wm.stubFor(
            get(urlPathEqualTo("/calendar/v3/users/me/calendarList"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#calendarList"
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listCalendars(connection)
        assertThat(result).isEmpty()
    }

    // ─── listCalendars: calendar without summary (null → "") ─────────────────

    @Test
    fun `listCalendars maps null summary to empty string`() {
        wm.stubFor(
            get(urlPathEqualTo("/calendar/v3/users/me/calendarList"))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#calendarList",
                          "items": [
                            {
                              "id": "nosummary@gmail.com"
                            }
                          ]
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listCalendars(connection)
        assertThat(result).hasSize(1)
        assertThat(result[0].summary).isEqualTo("")
        assertThat(result[0].primary).isFalse()
    }

    // ─── listEvents: null items in response ──────────────────────────────────

    @Test
    fun `listEvents handles null items in response gracefully`() {
        val calendarPath = "/calendar/v3/calendars/primary@gmail.com/events"

        wm.stubFor(
            get(urlPathEqualTo(calendarPath))
                .willReturn(
                    okJson(
                        """
                        {
                          "kind": "calendar#events",
                          "nextSyncToken": "sync-no-items"
                        }
                        """.trimIndent()
                    )
                )
        )

        val result = client.listEvents(connection, "primary@gmail.com", null, null, null)
        assertThat(result.events).isEmpty()
        assertThat(result.nextSyncToken).isEqualTo("sync-no-items")
        assertThat(result.fullResyncRequired).isFalse()
    }
}
