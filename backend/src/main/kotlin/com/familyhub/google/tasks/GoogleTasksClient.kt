package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.token.GoogleTokenProvider
import com.google.api.client.http.HttpRequestInitializer
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.tasks.Tasks
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import com.google.api.services.tasks.model.Task as GoogleTask

data class GoogleTaskListInfo(val id: String, val title: String)

/**
 * Ergebnis eines Listen-Vollabrufs. [complete] ist false, wenn die Paginierung
 * nach mindestens einer erfolgreichen Seite abgebrochen ist — dann liegen die
 * gelesenen Aufgaben zwar zur Aktualisierung vor, ein Löschabgleich wäre aber
 * Datenverlust und ist verboten. Das ist die Wurzelbehebung von TA-GOO-17.
 */
data class TaskPage(val tasks: List<GoogleTask>, val complete: Boolean)

private const val PAGE_SIZE = 100
private const val CONNECT_TIMEOUT_MS = 5_000
private const val READ_TIMEOUT_MS = 30_000

@Component
class GoogleTasksClient(
    private val tokenProvider: GoogleTokenProvider,
    private val transport: NetHttpTransport,
    @Value("\${google.tasks-api-base-url:https://tasks.googleapis.com/}") private val baseUrl: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private fun buildTasks(connection: GoogleConnection): Tasks {
        val token = tokenProvider.validAccessToken(connection)
        val initializer =
            HttpRequestInitializer { request ->
                request.headers.authorization = "Bearer $token"
                request.connectTimeout = CONNECT_TIMEOUT_MS
                request.readTimeout = READ_TIMEOUT_MS
            }
        return Tasks.Builder(transport, GsonFactory.getDefaultInstance(), initializer)
            .setApplicationName("FamilyHub")
            .setRootUrl(baseUrl)
            .build()
    }

    fun listTaskLists(connection: GoogleConnection): List<GoogleTaskListInfo> {
        val service = buildTasks(connection)
        val result = mutableListOf<GoogleTaskListInfo>()
        var pageToken: String? = null
        do {
            val request = service.tasklists().list().also { req -> pageToken?.let { req.pageToken = it } }
            val response = request.execute()
            response.items?.forEach { entry ->
                result += GoogleTaskListInfo(id = entry.id, title = entry.title ?: "")
            }
            pageToken = response.nextPageToken
        } while (pageToken != null)
        return result
    }

    fun listTasks(
        connection: GoogleConnection,
        taskListId: String,
    ): TaskPage {
        val service = buildTasks(connection)
        val collected = mutableListOf<GoogleTask>()
        var pageToken: String? = null
        var firstPage = true
        do {
            val response =
                try {
                    service.tasks().list(taskListId)
                        .setShowCompleted(true)
                        .setShowHidden(true)
                        .setShowDeleted(true)
                        .setMaxResults(PAGE_SIZE)
                        .also { req -> pageToken?.let { req.pageToken = it } }
                        .execute()
                } catch (ex: Exception) {
                    // Scheitert schon die erste Seite, hat der Aufrufer nichts Brauchbares —
                    // dann ist der Fehler seiner. Bricht es später ab, liefern wir die
                    // Teilmenge mit complete=false zurück, damit nichts gelöscht wird.
                    if (firstPage) throw ex
                    log.error("Pagination für Aufgabenliste {} abgebrochen: {}", taskListId, ex.message, ex)
                    return TaskPage(collected, complete = false)
                }
            firstPage = false
            response.items?.let { collected.addAll(it) }
            pageToken = response.nextPageToken
        } while (pageToken != null)
        return TaskPage(collected, complete = true)
    }

    fun insertTask(
        connection: GoogleConnection,
        taskListId: String,
        task: GoogleTask,
    ): GoogleTask = buildTasks(connection).tasks().insert(taskListId, task).execute()

    fun patchTask(
        connection: GoogleConnection,
        taskListId: String,
        taskId: String,
        task: GoogleTask,
    ): GoogleTask = buildTasks(connection).tasks().patch(taskListId, taskId, task).execute()

    fun deleteTask(
        connection: GoogleConnection,
        taskListId: String,
        taskId: String,
    ) {
        buildTasks(connection).tasks().delete(taskListId, taskId).execute()
    }
}
