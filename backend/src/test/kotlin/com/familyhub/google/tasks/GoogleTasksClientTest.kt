package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.token.GoogleTokenProvider
import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.*
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.google.api.client.http.javanet.NetHttpTransport
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

class GoogleTasksClientTest {
    private lateinit var wm: WireMockServer
    private lateinit var client: GoogleTasksClient
    private val tokenProvider = mockk<GoogleTokenProvider>()
    private val connection =
        GoogleConnection(
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
        client = GoogleTasksClient(tokenProvider, NetHttpTransport(), wm.baseUrl() + "/")
    }

    @AfterEach
    fun tearDown() = wm.stop()

    @Test
    fun `listTaskLists follows pagination over two pages`() {
        wm.stubFor(
            get(urlPathEqualTo("/tasks/v1/users/@me/lists"))
                .withQueryParam("pageToken", absent())
                .willReturn(
                    okJson(
                        """
                        {
                          "items": [{"id": "list1", "title": "Papa"}],
                          "nextPageToken": "page2"
                        }
                        """.trimIndent(),
                    ),
                ),
        )
        wm.stubFor(
            get(urlPathEqualTo("/tasks/v1/users/@me/lists"))
                .withQueryParam("pageToken", equalTo("page2"))
                .willReturn(okJson("""{"items": [{"id": "list2", "title": "Einkaufen"}]}""")),
        )

        val result = client.listTaskLists(connection)

        assertThat(result).hasSize(2)
        assertThat(result.map { it.id }).containsExactly("list1", "list2")
        assertThat(result[0].title).isEqualTo("Papa")
    }

    @Test
    fun `listTaskLists handles response without items`() {
        wm.stubFor(get(urlPathEqualTo("/tasks/v1/users/@me/lists")).willReturn(okJson("{}")))
        assertThat(client.listTaskLists(connection)).isEmpty()
    }

    @Test
    fun `listTaskLists maps missing title to empty string`() {
        wm.stubFor(
            get(urlPathEqualTo("/tasks/v1/users/@me/lists"))
                .willReturn(okJson("""{"items": [{"id": "list1"}]}""")),
        )
        assertThat(client.listTaskLists(connection)[0].title).isEqualTo("")
    }

    @Test
    fun `listTasks collects all pages and reports complete`() {
        val path = "/tasks/v1/lists/list1/tasks"
        wm.stubFor(
            get(urlPathEqualTo(path))
                .withQueryParam("pageToken", absent())
                .withQueryParam("showCompleted", equalTo("true"))
                .withQueryParam("showHidden", equalTo("true"))
                .withQueryParam("showDeleted", equalTo("true"))
                .withQueryParam("maxResults", equalTo("100"))
                .willReturn(
                    okJson(
                        """
                        {
                          "items": [{"id": "t1", "title": "Milch", "status": "needsAction"}],
                          "nextPageToken": "p2"
                        }
                        """.trimIndent(),
                    ),
                ),
        )
        wm.stubFor(
            get(urlPathEqualTo(path))
                .withQueryParam("pageToken", equalTo("p2"))
                .willReturn(
                    okJson("""{"items": [{"id": "t2", "title": "Brot", "status": "completed"}]}"""),
                ),
        )

        val page = client.listTasks(connection, "list1")

        assertThat(page.complete).isTrue()
        assertThat(page.tasks.map { it.id }).containsExactly("t1", "t2")
    }

    @Test
    fun `listTasks reports incomplete when a later page fails`() {
        val path = "/tasks/v1/lists/list1/tasks"
        wm.stubFor(
            get(urlPathEqualTo(path))
                .withQueryParam("pageToken", absent())
                .willReturn(
                    okJson("""{"items": [{"id": "t1", "title": "Milch"}], "nextPageToken": "p2"}"""),
                ),
        )
        wm.stubFor(
            get(urlPathEqualTo(path))
                .withQueryParam("pageToken", equalTo("p2"))
                .willReturn(aResponse().withStatus(500)),
        )

        val page = client.listTasks(connection, "list1")

        // Die erste Seite trägt Aktualisierungen; complete=false verhindert später jedes Löschen.
        assertThat(page.complete).isFalse()
        assertThat(page.tasks.map { it.id }).containsExactly("t1")
    }

    @Test
    fun `listTasks rethrows when the very first page fails`() {
        wm.stubFor(
            get(urlPathEqualTo("/tasks/v1/lists/list1/tasks"))
                .willReturn(
                    aResponse()
                        .withStatus(403)
                        .withHeader("Content-Type", "application/json; charset=UTF-8")
                        .withBody(
                            """
                            {"error": {"code": 403, "message": "Insufficient Permission",
                             "errors": [{"domain": "global", "reason": "insufficientPermissions"}]}}
                            """.trimIndent(),
                        ),
                ),
        )

        assertThatThrownBy { client.listTasks(connection, "list1") }
            .isInstanceOf(com.google.api.client.googleapis.json.GoogleJsonResponseException::class.java)
    }

    @Test
    fun `insertTask posts and returns the created task`() {
        wm.stubFor(
            post(urlPathEqualTo("/tasks/v1/lists/list1/tasks"))
                .willReturn(okJson("""{"id": "new-id", "title": "Einkaufen", "status": "needsAction"}""")),
        )

        val result = client.insertTask(connection, "list1", GoogleTask().setTitle("Einkaufen"))

        assertThat(result.id).isEqualTo("new-id")
        assertThat(result.title).isEqualTo("Einkaufen")
    }

    @Test
    fun `patchTask sends PATCH and returns the updated task`() {
        // NetHttpTransport unterstützt kein natives HTTP-PATCH (nur GET/POST/PUT/HEAD/DELETE);
        // der Google-API-Client-Interceptor MethodOverride sendet PATCH-Requests deshalb als POST
        // mit Header X-HTTP-Method-Override: PATCH — der Tasks-Server behandelt sie serverseitig
        // dennoch als echtes Partial-Update. Deshalb matchen wir hier auf POST + Override-Header,
        // nicht auf den WireMock-`patch`-Matcher.
        wm.stubFor(
            post(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1"))
                .withHeader("X-HTTP-Method-Override", equalTo("PATCH"))
                .willReturn(okJson("""{"id": "t1", "title": "Milch", "status": "completed"}""")),
        )

        val result = client.patchTask(connection, "list1", "t1", GoogleTask().setStatus("completed"))

        assertThat(result.status).isEqualTo("completed")
        // Entscheidend: Titel bleibt erhalten — genau das konnte das Altsystem mit PUT nicht.
        assertThat(result.title).isEqualTo("Milch")
        // Beweist echtes Partial-Update: der gesendete Request-Body enthält NUR das geänderte
        // Feld (status), nicht den kompletten Task (insbesondere kein title-Feld). Andernfalls
        // würde die obige Assertion auf result.title auch bei einem versehentlichen Full-Replace
        // (wie beim Altsystem mit PUT) grün bleiben, weil sie nur die kanonisierte Antwort prüft.
        wm.verify(
            postRequestedFor(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1"))
                .withHeader("X-HTTP-Method-Override", equalTo("PATCH"))
                .withRequestBody(matchingJsonPath("$.status", equalTo("completed")))
                .withRequestBody(matchingJsonPath("$.title", absent())),
        )
    }

    @Test
    fun `deleteTask sends DELETE without throwing`() {
        wm.stubFor(
            delete(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1"))
                .willReturn(aResponse().withStatus(204)),
        )

        client.deleteTask(connection, "list1", "t1")

        wm.verify(deleteRequestedFor(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1")))
    }

    // ─── listTasks: null items in response ─────────────────────────────────

    @Test
    fun `listTasks handles null items in response gracefully`() {
        wm.stubFor(
            get(urlPathEqualTo("/tasks/v1/lists/list1/tasks"))
                .willReturn(okJson("""{"kind": "tasks#tasks"}""")),
        )

        val page = client.listTasks(connection, "list1")

        assertThat(page.tasks).isEmpty()
        assertThat(page.complete).isTrue()
    }
}
