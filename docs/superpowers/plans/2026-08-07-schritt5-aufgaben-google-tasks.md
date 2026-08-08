# Sprint 5 — Aufgaben + Google-Tasks-Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Führe die Checkboxen mit.** Hake jeden Schritt (`- [x]`) ab, sobald er erledigt ist, und committe den Plan zusammen mit dem Code. Beim Settings-Overhaul ist das unterblieben; dieser Plan wird ausdrücklich als Fortschrittsanzeige benutzt. Wer mitten in einer Phase übernimmt, muss am Zustand der Checkboxen erkennen können, wo es weitergeht.

**Goal:** Persönliche Aufgaben in FamilyHub — als Mitgliederkarten mit Fortschrittsring auf einer eigenen Ansicht `/tasks`, bidirektional abgeglichen mit Google Tasks.

**Architecture:** Strukturgleich zum Kalender-Sync aus Sprint 4. `task_lists` entspricht `calendar_subscriptions`, `tasks` entspricht `events`, `TaskSyncService.syncConnection` entspricht `CalendarSyncService.syncConnection`, ein eigener `TaskSyncScheduler` läuft neben dem Kalender-Scheduler. Schreibzugriffe gehen wie im `EventService` **erst zu Google, dann in die DB** — Google ist die Wahrheit, es gibt keinen zweiten Zustandsraum. Google Tasks bietet **keinen** `syncToken`; jeder Lauf ist ein vollständig paginierter Vollabruf.

**Tech Stack:** Backend — Kotlin 2.0.21 / Spring Boot 3.3.5, Java 21, JPA, Flyway, `google-api-services-tasks`, JUnit 5 + MockK + AssertJ + WireMock + Testcontainers. Frontend — React 18 / TypeScript / Vite, Tailwind v3 (Design-Tokens), TanStack Query, react-router v6, `lucide-react`, vitest + @testing-library/react, Playwright. Contract — `api/openapi.yml` (kotlin-spring + orval Codegen).

**Spec:** `docs/superpowers/specs/2026-08-07-schritt5-aufgaben-google-tasks-design.md`

## Global Constraints

- **Backend-Befehle laufen aus `backend/`** und brauchen **Java 21** — `JAVA_HOME` muss auf ein JDK 21 zeigen, sonst bricht `./gradlew` mit `IllegalArgumentException: 25.0.3` ab. Vollgate: `./gradlew check`. Einzelner Test: `./gradlew test --tests "com.familyhub.google.tasks.TaskSyncServiceTest"`.
- **Backend-Tests brauchen Docker** (Testcontainers startet PostgreSQL). Reine MockK-Unit-Tests brauchen es nicht.
- **Frontend-Befehle laufen aus `frontend/`** (Node ≥ 20). Vollgate: `npm run check` (`tsc --noEmit` + `eslint . --max-warnings 0` + `depcruise` + `test:coverage`). Einzelner Test: `npm run test:run -- <pfad>`.
- **Coverage-Schwellen (erzwungen von `npm run check`): lines 90, branches 100, functions 90, statements 90.** Jeder `if` / `? :` / `&&` / `||` / Default-Parameter, den du einführst, muss von einem Test durchlaufen werden. **Das ist die strikteste Nebenbedingung des Plans.** `src/api/generated/`, `src/components/ui/`, `src/test/` und `src/main.tsx` sind laut `frontend/vite.config.ts` coverage-befreit.
- **Keine defensiven `??` / `?.` ohne erreichbaren Nullfall.** v8 zählt sie als Branch; ein unerreichbarer Zweig ist nicht testbar und lässt das Gate scheitern. Wo generierte Typen optional sind, es fachlich aber nicht sein kann: an **einer** Stelle normalisieren, nicht an jeder Verwendung absichern.
- **Contract-first:** generierten Code **nie** von Hand editieren. `api/openapi.yml` ändern, dann regenerieren — Frontend `npm run generate:api`, Backend `./gradlew openApiGenerate` (läuft in `./gradlew check` mit). Generierter Code ist gitignored; committe nur `api/openapi.yml`.
- **Alle Vertragsänderungen in diesem Plan sind additiv** — oasdiff meldet keinen Breaking Change, es braucht **kein** `breaking-change`-Label.
- **Deutschsprachige UI, wortwörtlich** wie in den Aufgaben angegeben. Auch Backend-Fehlermeldungen sind deutsch.
- **Touch-Ziele ≥ 44 × 44 px** — Buttons bekommen `min-h-[44px]`, reine Icon-Buttons zusätzlich `min-w-[44px]`. **Keine hover-only-Interaktionen** (Wandanzeige, Fingerbedienung).
- **Nur Design-Tokens für Farben** (`bg-bg`, `bg-surface`, `border-subtle`, `text-primary`, `text-muted`, `bg-accent`, `text-danger`, `bg-danger`, `text-warn`). Niemals `bg-slate-900` o. ä. hartcodieren — sonst bricht Hell/Dunkel.
- **Named Exports; Funktionskomponenten ohne explizite Rückgabetyp-Annotation** (Idiom aus `SnackbarProvider.tsx`, `PinSessionContext.tsx`). Tailwind-Klassen, keine Inline-Styles außer dem etablierten Muster für Mitgliedsfarben (`style={{ backgroundColor: … }}`).
- **`@/` ist der Pfad-Alias auf `frontend/src/`.**
- **Namenskollisionen sind real:** unsere Entity heißt `Task`, Googles DTO auch. In jeder Datei, die beide sieht, mit Alias importieren: `import com.google.api.services.tasks.model.Task as GoogleTask` und `import com.google.api.services.tasks.model.TaskList as GoogleTaskListDto`.
- **Phasenreihenfolge A → B → C → D.** Jede Phase endet grün (`./gradlew check` bzw. `npm run check`), bevor die nächste beginnt.
- **Vor jedem Commit** die zum Commit gehörenden Gates laufen lassen. Vor dem Abschluss einer Phase: `scripts/pre-commit-check.sh`.

---

## File Structure

### Phase A — Backend-Fundament
- `backend/src/main/resources/db/migration/V11__task_lists_and_tasks.sql` — **neu.** Beide Tabellen.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskList.kt` — **neu.** JPA-Entity, Gegenstück zu `CalendarSubscription`.
- `backend/src/main/kotlin/com/familyhub/google/tasks/Task.kt` — **neu.** JPA-Entity, Gegenstück zu `Event`.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListRepository.kt` — **neu.**
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskRepository.kt` — **neu.**
- `backend/src/main/kotlin/com/familyhub/google/tasks/GoogleTasksClient.kt` — **neu.** HTTP-Zugriff, Pagination, `patch`.
- `backend/build.gradle.kts` — **ändern.** `google-api-services-tasks` ergänzen.
- `backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt` — **ändern.** Tasks-Scope + Konstante.

### Phase B — Backend-Sync, Service, Vertrag
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskSyncService.kt` — **neu.** Listen-Refresh, Vollabruf, Löschabgleich.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskMapper.kt` — **neu.** Google-DTO ↔ Entity, isoliert testbar.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListQueryService.kt` — **neu.** Listen lesen, Auswahl speichern, Sync auslösen.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskService.kt` — **neu.** Lesen + Schreibpfad.
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListController.kt` — **neu.**
- `backend/src/main/kotlin/com/familyhub/google/tasks/TaskController.kt` — **neu.**
- `backend/src/main/kotlin/com/familyhub/google/sync/TaskSyncScheduler.kt` — **neu.**
- `api/openapi.yml` — **ändern.** Sieben Endpunkte + vier Schemata.

### Phase C — Frontend-Aufgabenansicht
- `frontend/src/features/tasks/dueDate.ts` — **neu.** Reine Funktion, Fälligkeitsbeschriftung.
- `frontend/src/features/tasks/taskSort.ts` — **neu.** Reine Funktion, Sortierung.
- `frontend/src/features/tasks/progress.ts` — **neu.** Reine Funktion, Fortschritt + Filterzähler.
- `frontend/src/features/tasks/useTasks.ts` — **neu.** Query/Mutation-Hooks.
- `frontend/src/features/tasks/useTaskSync.ts` — **neu.** Manueller Sync über alle Verbindungen.
- `frontend/src/features/tasks/ProgressRing.tsx` — **neu.**
- `frontend/src/features/tasks/TaskRow.tsx` — **neu.**
- `frontend/src/features/tasks/MemberTaskCard.tsx` — **neu.**
- `frontend/src/features/tasks/TaskFilterBar.tsx` — **neu.**
- `frontend/src/features/tasks/TaskDialog.tsx` — **neu.**
- `frontend/src/features/tasks/TasksView.tsx` — **neu.**
- `frontend/src/routing/AppShell.tsx` — **ändern.** Bereichsnavigation.
- `frontend/src/App.tsx` — **ändern.** Route `/tasks`.

### Phase D — Einstellungen, Scope-Hinweis, Abschluss
- `frontend/src/features/tasks/useTaskLists.ts` — **neu.** Listen-Hooks für die Einstellungen.
- `frontend/src/features/tasks/tasksScope.ts` — **neu.** Reine Funktion: hat eine Verbindung den Tasks-Scope?
- `frontend/src/features/tasks/TasksScopeNotice.tsx` — **neu.** Hinweis + Neuverbinden.
- `frontend/src/features/google/TaskListSection.tsx` — **neu.** Settings-Sektion analog `CalendarSection`.
- `frontend/src/features/settings/SettingsView.tsx` — **ändern.** Sektion einhängen.
- `frontend/e2e/tasks.spec.ts` — **neu.**
- `CLAUDE.md` — **ändern.** Build-Order-Haken, Sprint 6 als „current".

---

# Phase A — Backend-Fundament

## Task 1: Schema und Entities

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__task_lists_and_tasks.sql`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskList.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/Task.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListRepository.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskRepository.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskPersistenceTest.kt`

**Interfaces:**
- Consumes: `google_connections(id)` aus V5.
- Produces: Entities `TaskList(connectionId, googleTaskListId, title, isSelected, isWriteTarget)` und `Task(taskListId, googleTaskId, ownerMemberId, title, notes, dueDate, status, priority, completedAt, etag, googleUpdated)`, beide mit `var id: UUID?`. Repositories `TaskListRepository` und `TaskRepository` mit den unten definierten Findern. Alle späteren Backend-Tasks bauen darauf auf.

- [x] **Step 1: Migration schreiben**

`backend/src/main/resources/db/migration/V11__task_lists_and_tasks.sql`:

```sql
-- V11: Google-Aufgabenlisten je Verbindung + Aufgaben
CREATE TABLE task_lists (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id        UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
    google_task_list_id  VARCHAR(255) NOT NULL,
    title                VARCHAR(512) NOT NULL,
    is_selected          BOOLEAN NOT NULL DEFAULT FALSE,
    is_write_target      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, google_task_list_id)
);

-- Höchstens eine Zielliste je Verbindung.
CREATE UNIQUE INDEX idx_task_lists_write_target
    ON task_lists (connection_id) WHERE is_write_target = TRUE;

CREATE TABLE tasks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_list_id     UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    google_task_id   VARCHAR(255) NOT NULL,
    owner_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    title            VARCHAR(500) NOT NULL,
    notes            TEXT,
    due_date         DATE,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed')),
    priority         VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high')),
    completed_at     TIMESTAMP WITH TIME ZONE,
    etag             VARCHAR(255),
    google_updated   TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (task_list_id, google_task_id)
);

CREATE INDEX idx_tasks_owner    ON tasks (owner_member_id);
CREATE INDEX idx_tasks_due_date ON tasks (due_date);
CREATE INDEX idx_tasks_status   ON tasks (status);
```

`due_date` ist bewusst `DATE`: Google Tasks kennt keine Uhrzeit, der Zeitanteil in `due` ist laut Google-Doku bedeutungslos. Es gibt bewusst **kein** `sync_status` (könnte nur je `'synced'` sein), **kein** `position` (Googles manuelle Reihenfolge wird nicht benutzt) und **kein** denormalisiertes `google_task_list_id`.

- [x] **Step 2: Entities und Repositories schreiben**

`TaskList.kt` — exakt dem Muster von `CalendarSubscription.kt` folgen (`@PrePersist`/`@PreUpdate`, `var id: UUID?` im Body):

```kotlin
package com.familyhub.google.tasks

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.PreUpdate
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "task_lists")
class TaskList(
    @Column(name = "connection_id", nullable = false)
    var connectionId: UUID,
    @Column(name = "google_task_list_id", nullable = false)
    var googleTaskListId: String,
    @Column(nullable = false)
    var title: String,
    @Column(name = "is_selected", nullable = false)
    var isSelected: Boolean = false,
    @Column(name = "is_write_target", nullable = false)
    var isWriteTarget: Boolean = false,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist
    protected fun onCreate() {
        val now = Instant.now()
        createdAt = now
        updatedAt = now
    }

    @PreUpdate
    protected fun onUpdate() {
        updatedAt = Instant.now()
    }
}
```

`Task.kt` — gleiches Muster:

```kotlin
package com.familyhub.google.tasks

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.PrePersist
import jakarta.persistence.PreUpdate
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Entity
@Table(name = "tasks")
class Task(
    @Column(name = "task_list_id", nullable = false)
    var taskListId: UUID,
    @Column(name = "google_task_id", nullable = false)
    var googleTaskId: String,
    @Column(name = "owner_member_id", nullable = false)
    var ownerMemberId: UUID,
    @Column(nullable = false)
    var title: String,
    @Column
    var notes: String? = null,
    @Column(name = "due_date")
    var dueDate: LocalDate? = null,
    @Column(nullable = false)
    var status: String = "pending",
    @Column
    var priority: String? = null,
    @Column(name = "completed_at")
    var completedAt: Instant? = null,
    @Column
    var etag: String? = null,
    @Column(name = "google_updated")
    var googleUpdated: Instant? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    var id: UUID? = null

    @Column(name = "created_at", updatable = false)
    var createdAt: Instant? = null

    @Column(name = "updated_at")
    var updatedAt: Instant? = null

    @PrePersist
    protected fun onCreate() {
        val now = Instant.now()
        createdAt = now
        updatedAt = now
    }

    @PreUpdate
    protected fun onUpdate() {
        updatedAt = Instant.now()
    }
}
```

`TaskListRepository.kt`:

```kotlin
package com.familyhub.google.tasks

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TaskListRepository : JpaRepository<TaskList, UUID> {
    fun findAllByConnectionId(connectionId: UUID): List<TaskList>

    fun findByConnectionIdAndGoogleTaskListId(
        connectionId: UUID,
        googleTaskListId: String,
    ): TaskList?

    fun findAllByConnectionIdAndIsSelectedTrue(connectionId: UUID): List<TaskList>
}
```

`TaskRepository.kt`:

```kotlin
package com.familyhub.google.tasks

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TaskRepository : JpaRepository<Task, UUID> {
    fun findAllByTaskListId(taskListId: UUID): List<Task>

    fun findByTaskListIdAndGoogleTaskId(
        taskListId: UUID,
        googleTaskId: String,
    ): Task?

    fun findAllByOwnerMemberId(ownerMemberId: UUID): List<Task>
}
```

- [x] **Step 3: Persistenztest schreiben**

`backend/src/test/kotlin/com/familyhub/google/tasks/TaskPersistenceTest.kt`. Orientiere dich an `CalendarSubscriptionFlagsIntegrationTest.kt` für Testcontainers-Setup und das Anlegen einer `GoogleConnection` samt `FamilyMember`.

Diese vier Fälle:

```kotlin
@Test
fun `saves a task list and finds it by connection and google id`()

@Test
fun `rejects a second task list with the same google id on one connection`()
// Erwartung: DataIntegrityViolationException (UNIQUE (connection_id, google_task_list_id))

@Test
fun `rejects a second write target on one connection`()
// Erwartung: DataIntegrityViolationException (partieller UNIQUE-Index)

@Test
fun `deletes tasks when their task list is deleted`()
// Liste + Task anlegen, Liste löschen, taskRepository.findAllByTaskListId(...) ist leer (FK CASCADE)
```

- [x] **Step 4: Tests laufen lassen — müssen fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskPersistenceTest"`
Expected: FAIL — die Klassen existieren noch nicht bzw. die Migration ist noch nicht angewandt, falls du Step 3 vor Step 1/2 machst. Wenn du der Reihenfolge oben folgst, schreibe den Test zuerst und beobachte den Compile-Fehler.

- [x] **Step 5: `MigrationSmokeTest` um V11 erweitern**

`backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt` — den bestehenden Test um Assertions ergänzen, dass die Tabellen `task_lists` und `tasks` nach der Migration existieren. Folge dem dort bereits verwendeten Stil.

- [x] **Step 6: Tests laufen lassen — müssen grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskPersistenceTest" --tests "com.familyhub.google.MigrationSmokeTest"`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V11__task_lists_and_tasks.sql \
        backend/src/main/kotlin/com/familyhub/google/tasks/ \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskPersistenceTest.kt \
        backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add task_lists and tasks schema with entities"
```

---

## Task 2: GoogleTasksClient

**Files:**
- Modify: `backend/build.gradle.kts` (Abhängigkeitsblock, neben `google-api-services-calendar`)
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/GoogleTasksClient.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/GoogleTasksClientTest.kt`

**Interfaces:**
- Consumes: `GoogleTokenProvider.validAccessToken(connection)`, `NetHttpTransport` (Spring-Bean, siehe `GoogleApiClientFactory`).
- Produces:
  - `data class GoogleTaskListInfo(val id: String, val title: String)`
  - `data class TaskPage(val tasks: List<GoogleTask>, val complete: Boolean)` — `GoogleTask` ist `com.google.api.services.tasks.model.Task`
  - `GoogleTasksClient.listTaskLists(connection): List<GoogleTaskListInfo>`
  - `GoogleTasksClient.listTasks(connection, taskListId): TaskPage`
  - `GoogleTasksClient.insertTask(connection, taskListId, task: GoogleTask): GoogleTask`
  - `GoogleTasksClient.patchTask(connection, taskListId, taskId, task: GoogleTask): GoogleTask`
  - `GoogleTasksClient.deleteTask(connection, taskListId, taskId)`

- [x] **Step 1: Abhängigkeit ergänzen**

In `backend/build.gradle.kts` direkt unter `google-api-services-calendar`:

```kotlin
implementation("com.google.apis:google-api-services-tasks:v1-rev20250518-2.0.0")
```

Die `v1-rev…`-Version ist zum Planungszeitpunkt nicht verifizierbar (Maven Central ist aus der Entwicklungsumgebung geblockt). **Falls Gradle die Version nicht auflösen kann**, nimm die neueste verfügbare `v1-rev*-2.0.0` — die API-Oberfläche (`Tasks.Builder`, `tasklists().list()`, `tasks().list/insert/patch/delete`) ist über alle Revisionen stabil.

Run: `./gradlew dependencies --configuration runtimeClasspath | grep tasks`
Expected: Die Abhängigkeit wird aufgelöst.

- [x] **Step 2: Failing Test schreiben**

`backend/src/test/kotlin/com/familyhub/google/tasks/GoogleTasksClientTest.kt`. Aufbau exakt wie `GoogleCalendarClientTest.kt` (WireMock mit `dynamicPort()`, gemockter `GoogleTokenProvider`, `baseUrl` mit abschließendem `/`).

```kotlin
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
        wm.stubFor(
            patch(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1"))
                .willReturn(okJson("""{"id": "t1", "title": "Milch", "status": "completed"}""")),
        )

        val result = client.patchTask(connection, "list1", "t1", GoogleTask().setStatus("completed"))

        assertThat(result.status).isEqualTo("completed")
        // Entscheidend: Titel bleibt erhalten — genau das konnte das Altsystem mit PUT nicht.
        assertThat(result.title).isEqualTo("Milch")
        wm.verify(patchRequestedFor(urlPathEqualTo("/tasks/v1/lists/list1/tasks/t1")))
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
}
```

- [x] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.GoogleTasksClientTest"`
Expected: FAIL — `GoogleTasksClient` existiert nicht (Compile-Fehler).

- [x] **Step 4: Client implementieren**

```kotlin
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

private const val PAGE_SIZE = 100L
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
```

- [x] **Step 5: Test laufen lassen — muss grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.GoogleTasksClientTest"`
Expected: PASS (9 Tests)

Falls `patch` in WireMock nicht greift: die Tasks-SDK sendet `PATCH` als echtes HTTP-PATCH; `com.github.tomakehurst.wiremock.client.WireMock.patch` ist der passende Matcher.

- [x] **Step 6: Commit**

```bash
git add backend/build.gradle.kts \
        backend/src/main/kotlin/com/familyhub/google/tasks/GoogleTasksClient.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/GoogleTasksClientTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add paginating Google Tasks client using PATCH"
```

---

## Task 3: Tasks-Scope in der Autorisierung

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt:37-42`
- Test: `backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt`

**Interfaces:**
- Produces: `const val TASKS_SCOPE = "https://www.googleapis.com/auth/tasks"` als **Top-Level-Konstante im Package `com.familyhub.google.oauth`**. `TaskSyncService` (Task 5) importiert sie; das Frontend hat ihren Wert in `tasksScope.ts` (Task 15) gespiegelt.

- [x] **Step 1: Failing Test schreiben**

In `GoogleOAuthFlowTest.kt` ergänzen:

```kotlin
@Test
fun `authorization url requests the tasks scope`() {
    val url = flow.buildAuthorizationUrl("client-id", "http://localhost/cb", "state", "challenge")
    assertThat(url).contains("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Ftasks")
}
```

Die exakte Kodierung hängt davon ab, wie `UriComponentsBuilder` den Scope-Parameter schreibt. Schau dir die bestehenden Scope-Assertions in dieser Testklasse an und übernimm deren Schreibweise — nutze dieselbe Form für `auth/tasks`.

- [x] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.oauth.GoogleOAuthFlowTest"`
Expected: FAIL — der Scope fehlt in der URL.

- [x] **Step 3: Scope ergänzen**

In `GoogleOAuthFlow.kt`, oberhalb der Klasse:

```kotlin
const val TASKS_SCOPE = "https://www.googleapis.com/auth/tasks"
```

und die Scope-Liste erweitern:

```kotlin
    private val scopes =
        listOf(
            "https://www.googleapis.com/auth/calendar",
            TASKS_SCOPE,
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/userinfo.email",
        )
```

- [x] **Step 4: Test laufen lassen — muss grün sein**

Run: `./gradlew test --tests "com.familyhub.google.oauth.GoogleOAuthFlowTest"`
Expected: PASS

- [x] **Step 5: Phase A abschließen**

Run: `./gradlew check`
Expected: PASS (ktlint, detekt, alle Tests, JaCoCo)

- [x] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/oauth/GoogleOAuthFlow.kt \
        backend/src/test/kotlin/com/familyhub/google/oauth/GoogleOAuthFlowTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(google): request the Tasks scope during authorization"
```

> **Betriebshinweis, den du im Abschlussbericht der Phase nennen musst:** Bestehende Google-Verbindungen haben den Tasks-Scope **nicht**. Sie müssen einmalig neu verbunden werden. Phase D baut den Hinweis dafür in die Oberfläche.

---

# Phase B — Backend-Sync, Service, Vertrag

## Task 4: TaskMapper

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskMapper.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskMapperTest.kt`

**Interfaces:**
- Produces:
  - `TaskMapper.toEntity(google: GoogleTask, taskListId: UUID, ownerMemberId: UUID): Task`
  - `TaskMapper.applyGoogleFields(target: Task, google: GoogleTask)` — überschreibt alle von Google gelieferten Felder, **fasst `priority` nicht an**
  - `TaskMapper.toGoogleTask(title: String?, notes: String?, dueDate: LocalDate?, status: String?): GoogleTask` — setzt nur die nicht-null-Felder (Teiländerung für `patch`)
  - `TaskMapper.isDeleted(google: GoogleTask): Boolean`

- [x] **Step 1: Failing Test schreiben**

`backend/src/test/kotlin/com/familyhub/google/tasks/TaskMapperTest.kt` — reiner Unit-Test, kein Spring, kein Docker:

```kotlin
package com.familyhub.google.tasks

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

class TaskMapperTest {
    private val mapper = TaskMapper()
    private val listId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    @Test
    fun `maps a google task to an entity`() {
        val google =
            GoogleTask()
                .setId("gt-1")
                .setTitle("Milch kaufen")
                .setNotes("2 Liter")
                .setDue("2026-08-12T00:00:00.000Z")
                .setStatus("needsAction")
                .setEtag("\"etag1\"")
                .setUpdated(com.google.api.client.util.DateTime("2026-08-07T10:00:00.000Z"))

        val entity = mapper.toEntity(google, listId, memberId)

        assertThat(entity.googleTaskId).isEqualTo("gt-1")
        assertThat(entity.taskListId).isEqualTo(listId)
        assertThat(entity.ownerMemberId).isEqualTo(memberId)
        assertThat(entity.title).isEqualTo("Milch kaufen")
        assertThat(entity.notes).isEqualTo("2 Liter")
        assertThat(entity.dueDate).isEqualTo(LocalDate.of(2026, 8, 12))
        assertThat(entity.status).isEqualTo("pending")
        assertThat(entity.completedAt).isNull()
        assertThat(entity.etag).isEqualTo("\"etag1\"")
    }

    @Test
    fun `maps google status completed and the completion timestamp`() {
        val google =
            GoogleTask()
                .setId("gt-2")
                .setTitle("Erledigt")
                .setStatus("completed")
                .setCompleted("2026-08-06T09:30:00.000Z")

        val entity = mapper.toEntity(google, listId, memberId)

        assertThat(entity.status).isEqualTo("completed")
        assertThat(entity.completedAt).isEqualTo(Instant.parse("2026-08-06T09:30:00Z"))
    }

    @Test
    fun `maps a missing title to Ohne Titel`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-3"), listId, memberId)
        assertThat(entity.title).isEqualTo("Ohne Titel")
    }

    @Test
    fun `maps a missing due date to null`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-4").setTitle("X"), listId, memberId)
        assertThat(entity.dueDate).isNull()
    }

    @Test
    fun `maps an unparsable due date to null instead of now`() {
        // Das Altsystem setzte hier still Instant.now() — ein Tippfehler erzeugte eine
        // Aufgabe mit Fälligkeit "jetzt". Wir lassen das Feld lieber leer.
        val entity = mapper.toEntity(GoogleTask().setId("gt-5").setTitle("X").setDue("kaputt"), listId, memberId)
        assertThat(entity.dueDate).isNull()
    }

    @Test
    fun `maps blank notes to null`() {
        val entity = mapper.toEntity(GoogleTask().setId("gt-6").setTitle("X").setNotes("   "), listId, memberId)
        assertThat(entity.notes).isNull()
    }

    @Test
    fun `applyGoogleFields overwrites google-owned fields but keeps the local priority`() {
        val existing =
            Task(
                taskListId = listId,
                googleTaskId = "gt-7",
                ownerMemberId = memberId,
                title = "Alt",
                notes = "alte Notiz",
                priority = "high",
            )

        mapper.applyGoogleFields(existing, GoogleTask().setId("gt-7").setTitle("Neu").setStatus("needsAction"))

        assertThat(existing.title).isEqualTo("Neu")
        assertThat(existing.notes).isNull()
        // priority ist rein lokal und überlebt jeden Sync
        assertThat(existing.priority).isEqualTo("high")
    }

    @Test
    fun `toGoogleTask sets only the provided fields`() {
        val google = mapper.toGoogleTask(title = null, notes = null, dueDate = null, status = "completed")

        assertThat(google.status).isEqualTo("completed")
        assertThat(google.title).isNull()
        assertThat(google.notes).isNull()
        assertThat(google.due).isNull()
    }

    @Test
    fun `toGoogleTask formats the due date as start of day UTC`() {
        val google =
            mapper.toGoogleTask(
                title = "Einkaufen",
                notes = "Liste",
                dueDate = LocalDate.of(2026, 8, 12),
                status = "needsAction",
            )

        assertThat(google.title).isEqualTo("Einkaufen")
        assertThat(google.notes).isEqualTo("Liste")
        assertThat(google.due).isEqualTo("2026-08-12T00:00:00.000Z")
    }

    @Test
    fun `isDeleted reports googles deleted flag`() {
        assertThat(mapper.isDeleted(GoogleTask().setDeleted(true))).isTrue()
        assertThat(mapper.isDeleted(GoogleTask().setDeleted(false))).isFalse()
        assertThat(mapper.isDeleted(GoogleTask())).isFalse()
    }
}
```

- [x] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskMapperTest"`
Expected: FAIL — `TaskMapper` existiert nicht.

- [x] **Step 3: Mapper implementieren**

```kotlin
package com.familyhub.google.tasks

import org.springframework.stereotype.Component
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import com.google.api.services.tasks.model.Task as GoogleTask

@Component
class TaskMapper {
    fun toEntity(
        google: GoogleTask,
        taskListId: UUID,
        ownerMemberId: UUID,
    ): Task {
        val entity =
            Task(
                taskListId = taskListId,
                googleTaskId = google.id,
                ownerMemberId = ownerMemberId,
                title = google.title ?: "Ohne Titel",
            )
        applyGoogleFields(entity, google)
        return entity
    }

    /**
     * Überschreibt alle Felder, die Google besitzt ("Google gewinnt").
     * [Task.priority] bleibt unangetastet — sie ist rein lokal und hat keine
     * Google-Entsprechung.
     */
    fun applyGoogleFields(
        target: Task,
        google: GoogleTask,
    ) {
        target.title = google.title ?: "Ohne Titel"
        target.notes = google.notes?.trim()?.takeIf { it.isNotEmpty() }
        target.dueDate = parseDueDate(google.due)
        target.status = if (google.status == "completed") "completed" else "pending"
        target.completedAt = parseInstant(google.completed)
        target.etag = google.etag
        target.googleUpdated = google.updated?.let { Instant.ofEpochMilli(it.value) }
    }

    /** Baut ein Teil-DTO für `tasks.patch` — nur nicht-null-Felder werden gesetzt. */
    fun toGoogleTask(
        title: String?,
        notes: String?,
        dueDate: LocalDate?,
        status: String?,
    ): GoogleTask {
        val google = GoogleTask()
        title?.let { google.title = it }
        notes?.let { google.notes = it }
        dueDate?.let { google.due = "${it}T00:00:00.000Z" }
        status?.let { google.status = if (it == "completed") "completed" else "needsAction" }
        return google
    }

    fun isDeleted(google: GoogleTask): Boolean = google.deleted == true

    /**
     * Google liefert `due` als RFC-3339-Zeitstempel, dessen Uhrzeitanteil laut
     * Google-Dokumentation bedeutungslos ist — wir nehmen nur das Datum.
     * Unlesbare Werte werden zu `null`; das Altsystem setzte hier still `now()`.
     */
    private fun parseDueDate(due: String?): LocalDate? =
        due?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

    private fun parseInstant(value: String?): Instant? =
        value?.let { runCatching { Instant.parse(it) }.getOrNull() }
}
```

- [x] **Step 4: Test laufen lassen — muss grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskMapperTest"`
Expected: PASS (10 Tests)

- [x] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/tasks/TaskMapper.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskMapperTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): map Google tasks to entities preserving local priority"
```

---

## Task 5: TaskSyncService

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskSyncService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskSyncServiceTest.kt`

**Interfaces:**
- Consumes: `GoogleTasksClient`, `TaskListRepository`, `TaskRepository`, `GoogleConnectionRepository`, `TaskMapper`, `TASKS_SCOPE`.
- Produces:
  - `data class TaskSyncResult(val created: Int, val updated: Int, val deleted: Int)` — **eigener Typ im Package `com.familyhub.google.tasks`**, damit keine Kopplung an `com.familyhub.google.calendar.SyncResult` entsteht.
  - `TaskSyncService.refreshTaskLists(connection): Unit`
  - `TaskSyncService.syncConnection(connection): TaskSyncResult`
  - `TaskSyncService.syncAll(): Unit`

- [ ] **Step 1: Failing Test schreiben**

`backend/src/test/kotlin/com/familyhub/google/tasks/TaskSyncServiceTest.kt` — reiner MockK-Test, kein Docker. Orientiere dich an `CalendarSyncServiceTest.kt`.

Diese Fälle, jeder als eigener `@Test`:

```kotlin
@Test
fun `refreshTaskLists inserts new lists as unselected`()
// Client liefert zwei Listen, Repo kennt keine → zwei save() mit isSelected == false

@Test
fun `refreshTaskLists updates the title and never touches isSelected`()
// Repo kennt "list1" mit isSelected=true, Client liefert neuen Titel
// → title aktualisiert, isSelected bleibt true

@Test
fun `refreshTaskLists deletes lists that vanished at google`()
// Repo kennt "list1" und "list2", Client liefert nur "list1" → delete für list2

@Test
fun `syncConnection skips connections that are not active`()
// connection.status = "revoked" → TaskSyncResult(0,0,0), keine Client-Aufrufe
// verify(exactly = 0) { tasksClient.listTaskLists(any()) }

@Test
fun `syncConnection skips connections without the tasks scope`()
// connection.scopes = listOf("https://www.googleapis.com/auth/calendar")
// → TaskSyncResult(0,0,0), keine Client-Aufrufe

@Test
fun `syncConnection only syncs selected lists`()
// zwei Listen, eine isSelected=false → listTasks nur für die ausgewählte

@Test
fun `syncConnection creates new tasks and counts them`()

@Test
fun `syncConnection updates known tasks and keeps the local priority`()
// Bestehende Task mit priority="high", Google liefert geänderten Titel
// → title neu, priority weiterhin "high", updated == 1

@Test
fun `syncConnection deletes tasks flagged deleted by google`()

@Test
fun `syncConnection deletes local tasks missing from a complete google page`()
// Lokal t1 und t2, Google liefert nur t1 mit complete=true → t2 wird gelöscht

@Test
fun `syncConnection updates lastSyncedAt on the connection`()

@Test
fun `syncConnection continues with the next list when one fails`()
// listTasks wirft für list1, liefert für list2 → list2 wird verarbeitet

@Test
fun `syncAll syncs every active connection`()
```

Ein Test des Satzes trägt die Kernabsicherung dieses Sprints und wird deshalb ausgeschrieben — **schreibe ihn genau so**:

```kotlin
@Test
fun `syncConnection deletes nothing when pagination was incomplete`() {
    // TA-GOO-17: Das Altsystem las nur die erste Google-Seite und löschte danach
    // alles, was nicht darauf stand. Genau das darf hier nicht passieren.
    val list = TaskList(connectionId = connectionId, googleTaskListId = "list1", title = "Papa", isSelected = true)
    list.id = listId
    val local1 = task(googleTaskId = "t1")
    val local2 = task(googleTaskId = "t2")

    every { tasksClient.listTaskLists(connection) } returns listOf(GoogleTaskListInfo("list1", "Papa"))
    every { taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, "list1") } returns list
    every { taskListRepo.findAllByConnectionId(connectionId) } returns listOf(list)
    every { taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connectionId) } returns listOf(list)
    every { taskListRepo.save(any()) } answers { firstArg() }
    // Seite 2 ist weggebrochen: nur t1 gelesen, complete = false
    every { tasksClient.listTasks(connection, "list1") } returns
        TaskPage(listOf(GoogleTask().setId("t1").setTitle("Milch")), complete = false)
    every { taskRepo.findByTaskListIdAndGoogleTaskId(listId, "t1") } returns local1
    every { taskRepo.findAllByTaskListId(listId) } returns listOf(local1, local2)
    every { taskRepo.save(any()) } answers { firstArg() }
    every { connectionRepo.save(any()) } answers { firstArg() }

    val result = service.syncConnection(connection)

    // t2 steht nicht auf der gelesenen Seite — trotzdem wird es NICHT gelöscht.
    verify(exactly = 0) { taskRepo.delete(any()) }
    assertThat(result.deleted).isEqualTo(0)
    // Die gelesene Seite trägt trotzdem ihre Aktualisierung.
    assertThat(result.updated).isEqualTo(1)
}
```

Die Helfer `task(googleTaskId = …)`, `connectionId`, `listId` und `connection` legst du wie in `CalendarSyncServiceTest.kt` als Felder der Testklasse an.

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskSyncServiceTest"`
Expected: FAIL — `TaskSyncService` existiert nicht.

- [ ] **Step 3: Service implementieren**

```kotlin
package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.oauth.TASKS_SCOPE
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant

data class TaskSyncResult(
    val created: Int,
    val updated: Int,
    val deleted: Int,
)

@Service
class TaskSyncService(
    private val tasksClient: GoogleTasksClient,
    private val taskListRepo: TaskListRepository,
    private val taskRepo: TaskRepository,
    private val connectionRepo: GoogleConnectionRepository,
    private val mapper: TaskMapper,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * Gleicht die Aufgabenlisten einer Verbindung mit Google ab.
     * Neue Listen kommen mit isSelected=false herein; bestehende werden nur im
     * Titel aktualisiert. Bei Google verschwundene Listen werden gelöscht — die
     * zugehörigen Aufgaben folgen per FK-CASCADE.
     */
    fun refreshTaskLists(connection: GoogleConnection) {
        val connectionId = connection.id!!
        val remote = tasksClient.listTaskLists(connection)
        for (info in remote) {
            val existing = taskListRepo.findByConnectionIdAndGoogleTaskListId(connectionId, info.id)
            if (existing == null) {
                taskListRepo.save(
                    TaskList(
                        connectionId = connectionId,
                        googleTaskListId = info.id,
                        title = info.title,
                        isSelected = false,
                    ),
                )
            } else {
                existing.title = info.title
                // isSelected und isWriteTarget werden NICHT verändert
                taskListRepo.save(existing)
            }
        }
        val remoteIds = remote.map { it.id }.toSet()
        taskListRepo.findAllByConnectionId(connectionId)
            .filter { it.googleTaskListId !in remoteIds }
            .forEach { taskListRepo.delete(it) }
    }

    fun syncConnection(connection: GoogleConnection): TaskSyncResult {
        if (connection.status != "active") {
            return TaskSyncResult(0, 0, 0)
        }
        if (TASKS_SCOPE !in connection.scopes) {
            log.warn(
                "Verbindung {} (Mitglied {}) hat den Tasks-Scope nicht — Aufgaben-Sync übersprungen",
                connection.id,
                connection.familyMemberId,
            )
            return TaskSyncResult(0, 0, 0)
        }

        refreshTaskLists(connection)

        var created = 0
        var updated = 0
        var deleted = 0
        for (list in taskListRepo.findAllByConnectionIdAndIsSelectedTrue(connection.id!!)) {
            try {
                val result = syncTaskList(connection, list)
                created += result.created
                updated += result.updated
                deleted += result.deleted
            } catch (ex: Exception) {
                log.error("Aufgabenliste {} konnte nicht synchronisiert werden: {}", list.googleTaskListId, ex.message, ex)
            }
        }

        connection.lastSyncedAt = Instant.now(clock)
        connectionRepo.save(connection)

        return TaskSyncResult(created, updated, deleted)
    }

    private fun syncTaskList(
        connection: GoogleConnection,
        list: TaskList,
    ): TaskSyncResult {
        val listId = list.id!!
        val page = tasksClient.listTasks(connection, list.googleTaskListId)

        var created = 0
        var updated = 0
        var deleted = 0

        for (googleTask in page.tasks) {
            val existing = taskRepo.findByTaskListIdAndGoogleTaskId(listId, googleTask.id)
            if (mapper.isDeleted(googleTask)) {
                if (existing != null) {
                    taskRepo.delete(existing)
                    deleted++
                }
            } else if (existing == null) {
                taskRepo.save(mapper.toEntity(googleTask, listId, connection.familyMemberId))
                created++
            } else {
                mapper.applyGoogleFields(existing, googleTask)
                taskRepo.save(existing)
                updated++
            }
        }

        if (page.complete) {
            val seenIds = page.tasks.map { it.id }.toSet()
            taskRepo.findAllByTaskListId(listId)
                .filter { it.googleTaskId !in seenIds }
                .forEach {
                    taskRepo.delete(it)
                    deleted++
                }
        } else {
            // Wurzelbehebung TA-GOO-17: unvollständige Seite darf niemals löschen.
            log.error(
                "Aufgabenliste {} unvollständig geladen — Löschabgleich übersprungen",
                list.googleTaskListId,
            )
        }

        return TaskSyncResult(created, updated, deleted)
    }

    fun syncAll() {
        for (connection in connectionRepo.findAllByStatus("active")) {
            syncConnection(connection)
        }
    }
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskSyncServiceTest"`
Expected: PASS (14 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/tasks/TaskSyncService.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskSyncServiceTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): sync Google task lists without deleting on partial pages"
```

---

## Task 6: TaskSyncScheduler

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/sync/TaskSyncScheduler.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/sync/TaskSyncSchedulerTest.kt`

**Interfaces:**
- Consumes: `GoogleConnectionRepository.findAllByStatus("active")`, `TaskSyncService.syncConnection`.
- Produces: `TaskSyncScheduler.runScheduledSync()`, `internal val running: AtomicBoolean`.

- [ ] **Step 1: Failing Test schreiben**

`TaskSyncSchedulerTest.kt` — 1:1 nach dem Muster von `CalendarSyncSchedulerTest.kt`:

```kotlin
@Test
fun `syncs every active connection`()

@Test
fun `skips the run while a previous one is still in progress`()
// scheduler.running.set(true) → verify(exactly = 0) { taskSyncService.syncConnection(any()) }

@Test
fun `continues with the next connection when one throws`()

@Test
fun `releases the guard after an exception`()
// Repository wirft → running muss danach false sein
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.sync.TaskSyncSchedulerTest"`
Expected: FAIL — `TaskSyncScheduler` existiert nicht.

- [ ] **Step 3: Scheduler implementieren**

```kotlin
package com.familyhub.google.sync

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.google.tasks.TaskSyncService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Eigener Scheduler neben [CalendarSyncScheduler] — nicht in diesen hineingebaut,
 * damit ein hängender Aufgaben-Lauf den Kalender nicht blockiert und beide
 * Intervalle getrennt konfigurierbar bleiben.
 */
@Component
class TaskSyncScheduler(
    private val connectionRepository: GoogleConnectionRepository,
    private val taskSyncService: TaskSyncService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** Internal: package-visible for tests to inspect/set the guard. */
    internal val running = AtomicBoolean(false)

    @Scheduled(fixedDelayString = "\${google.sync.tasks-fixed-delay-ms:900000}")
    fun runScheduledSync() {
        if (!running.compareAndSet(false, true)) {
            log.warn("Geplanter Aufgaben-Sync übersprungen — vorheriger Lauf noch aktiv")
            return
        }
        try {
            val connections = connectionRepository.findAllByStatus("active")
            log.info("Starte geplanten Aufgaben-Sync für {} aktive Verbindung(en)", connections.size)
            for (connection in connections) {
                try {
                    val result = taskSyncService.syncConnection(connection)
                    log.info(
                        "Aufgaben synchronisiert für Verbindung {} (Mitglied {}): created={}, updated={}, deleted={}",
                        connection.id,
                        connection.familyMemberId,
                        result.created,
                        result.updated,
                        result.deleted,
                    )
                } catch (ex: Exception) {
                    log.error(
                        "Aufgaben-Sync für Verbindung {} (Mitglied {}) fehlgeschlagen: {}",
                        connection.id,
                        connection.familyMemberId,
                        ex.message,
                        ex,
                    )
                }
            }
        } finally {
            running.set(false)
        }
    }
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `./gradlew test --tests "com.familyhub.google.sync.TaskSyncSchedulerTest"`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/sync/TaskSyncScheduler.kt \
        backend/src/test/kotlin/com/familyhub/google/sync/TaskSyncSchedulerTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add scheduled task sync with reentrancy guard"
```

---

## Task 7: API-Vertrag

**Files:**
- Modify: `api/openapi.yml` (Pfade nach `/v1/events/{id}/series`, Schemata nach `CalendarResponse`)

**Interfaces:**
- Produces (Backend, generiert): Interfaces `GoogleTaskListsApi` (Tag `GoogleTaskLists`) und `TasksApi` (Tag `Tasks`); Modelle `TaskListResponse`, `SelectedTaskListsRequest`, `TaskResponse`, `CreateTaskRequest`, `UpdateTaskRequest`.
- Produces (Frontend, generiert): `useListTaskLists`, `useSaveSelectedTaskLists`, `useSyncTaskLists`, `useListTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`, dazu `getListTaskListsQueryKey`, `getListTasksQueryKey`.

- [ ] **Step 1: Pfade ergänzen**

An `api/openapi.yml` unter den bestehenden Pfaden anfügen. `security: []` ist auf allen Pfaden gesetzt (der PIN-Schutz sitzt als `@RequiresPinSession` im Controller, nicht im Vertrag) — genau wie bei den Kalender-Pfaden.

```yaml
  /v1/google/task-lists:
    get:
      operationId: listTaskLists
      summary: List Google task lists, optionally filtered by family member
      tags: [GoogleTaskLists]
      security: []
      parameters:
        - name: memberId
          in: query
          required: false
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: List of task lists
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/TaskListResponse"

  /v1/google/task-lists/selected:
    put:
      operationId: saveSelectedTaskLists
      summary: Save which task lists are selected for sync (PIN-protected)
      tags: [GoogleTaskLists]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SelectedTaskListsRequest"
      responses:
        "200":
          description: Selection saved

  /v1/google/task-lists/sync:
    post:
      operationId: syncTaskLists
      summary: Manually trigger a task sync for a family member
      tags: [GoogleTaskLists]
      security: []
      parameters:
        - name: memberId
          in: query
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Sync result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SyncResultResponse"

  /v1/tasks:
    get:
      operationId: listTasks
      summary: List tasks; completed tasks are limited to the last 30 days
      tags: [Tasks]
      security: []
      parameters:
        - name: memberId
          in: query
          required: false
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: List of tasks
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/TaskResponse"
    post:
      operationId: createTask
      summary: Create a task and push it to Google Tasks
      tags: [Tasks]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTaskRequest"
      responses:
        "201":
          description: Task created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TaskResponse"

  /v1/tasks/{id}:
    patch:
      operationId: updateTask
      summary: Partially update a task and push the change to Google Tasks
      tags: [Tasks]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateTaskRequest"
      responses:
        "200":
          description: Task updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TaskResponse"
    delete:
      operationId: deleteTask
      summary: Delete a task at Google and locally
      tags: [Tasks]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "204":
          description: Task deleted
```

- [ ] **Step 2: Schemata ergänzen**

Unter `components.schemas`:

```yaml
    TaskListResponse:
      type: object
      required: [id, title, isSelected, isWriteTarget, memberId]
      properties:
        id:
          type: string
          description: Google task list id
        title:
          type: string
        isSelected:
          type: boolean
        isWriteTarget:
          type: boolean
        memberId:
          type: string
          format: uuid

    SelectedTaskListsRequest:
      type: object
      required: [memberId, taskListIds]
      properties:
        memberId:
          type: string
          format: uuid
        taskListIds:
          type: array
          items:
            type: string
        writeTargetId:
          type: string
          nullable: true
          description: Which of the selected lists new tasks are created in

    TaskResponse:
      type: object
      required: [id, memberId, title, status]
      properties:
        id:
          type: string
          format: uuid
        memberId:
          type: string
          format: uuid
        title:
          type: string
        notes:
          type: string
          nullable: true
        dueDate:
          type: string
          format: date
          nullable: true
        status:
          type: string
          enum: [pending, completed]
        priority:
          type: string
          nullable: true
          enum: [low, medium, high]
        completedAt:
          type: string
          nullable: true
          description: ISO-8601 timestamp

    CreateTaskRequest:
      type: object
      required: [memberId, title]
      properties:
        memberId:
          type: string
          format: uuid
        title:
          type: string
        notes:
          type: string
          nullable: true
        dueDate:
          type: string
          format: date
          nullable: true
        priority:
          type: string
          nullable: true
          enum: [low, medium, high]

    UpdateTaskRequest:
      type: object
      properties:
        title:
          type: string
        notes:
          type: string
          nullable: true
        dueDate:
          type: string
          format: date
          nullable: true
        priority:
          type: string
          nullable: true
          enum: [low, medium, high]
        status:
          type: string
          enum: [pending, completed]
```

`ConnectionResponse` bleibt **unverändert** — es trägt bereits `scopes: string[]`, aus dem das Frontend den fehlenden Tasks-Scope ableitet.

- [ ] **Step 3: Codegen laufen lassen**

```bash
cd backend && ./gradlew openApiGenerate
cd ../frontend && npm run generate:api
```
Expected: Beide Läufe grün; die oben genannten Interfaces und Hooks existieren.

- [ ] **Step 4: Commit**

Generierter Code ist gitignored — **nur** die Spec committen.

```bash
git add api/openapi.yml docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(api): add task and task-list endpoints to the contract"
```

---

## Task 8: TaskListQueryService und TaskListController

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListQueryService.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskListController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskListQueryServiceTest.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskListControllerTest.kt`

**Interfaces:**
- Produces:
  - `data class TaskListView(val id: String, val title: String, val isSelected: Boolean, val isWriteTarget: Boolean, val memberId: UUID)`
  - `TaskListQueryService.listForMember(memberId): List<TaskListView>` — ruft vorher `refreshTaskLists`, wie `CalendarQueryService.listForMember`
  - `TaskListQueryService.listAll(): List<TaskListView>`
  - `TaskListQueryService.saveSelection(memberId, taskListIds, writeTargetId): Unit`
  - `TaskListQueryService.syncForMember(memberId): TaskSyncResult`

- [ ] **Step 1: Failing Tests schreiben**

`TaskListQueryServiceTest.kt` (MockK):

```kotlin
@Test
fun `listForMember returns an empty list when the member has no connection`()

@Test
fun `listForMember refreshes lists before returning them`()

@Test
fun `listAll spans all active connections`()

@Test
fun `saveSelection selects exactly the given ids`()
// drei Listen, zwei ids → genau diese zwei isSelected=true, die dritte false

@Test
fun `saveSelection sets the write target and clears the previous one`()

@Test
fun `saveSelection ignores a write target that is not selected`()
// writeTargetId zeigt auf eine nicht ausgewählte Liste → keine Liste ist Zielliste

@Test
fun `saveSelection throws when the member has no connection`()
// ResourceNotFoundException mit "Keine Google-Verbindung für dieses Mitglied gefunden"

@Test
fun `syncForMember delegates to the sync service`()

@Test
fun `syncForMember throws when the member has no connection`()
```

`TaskListControllerTest.kt` — `@WebMvcTest`-Stil wie `CalendarControllerTest.kt`:

```kotlin
@Test
fun `GET task-lists without memberId returns all lists`()

@Test
fun `GET task-lists with memberId filters by member`()

@Test
fun `PUT selected without a valid pin session returns 401`()

@Test
fun `PUT selected with a valid pin session returns 200`()

@Test
fun `POST sync returns the sync result`()
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskList*"`
Expected: FAIL — Klassen existieren nicht.

- [ ] **Step 3: Service implementieren**

```kotlin
package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import org.springframework.stereotype.Service
import java.util.UUID

data class TaskListView(
    val id: String,
    val title: String,
    val isSelected: Boolean,
    val isWriteTarget: Boolean,
    val memberId: UUID,
)

@Service
class TaskListQueryService(
    private val connectionRepository: GoogleConnectionRepository,
    private val taskListRepository: TaskListRepository,
    private val taskSyncService: TaskSyncService,
) {
    private fun TaskList.toView(memberId: UUID) =
        TaskListView(
            id = googleTaskListId,
            title = title,
            isSelected = isSelected,
            isWriteTarget = isWriteTarget,
            memberId = memberId,
        )

    fun listForMember(memberId: UUID): List<TaskListView> {
        val connection = connectionRepository.findByFamilyMemberId(memberId) ?: return emptyList()
        taskSyncService.refreshTaskLists(connection)
        return taskListRepository.findAllByConnectionId(connection.id!!)
            .map { it.toView(connection.familyMemberId) }
    }

    fun listAll(): List<TaskListView> =
        connectionRepository.findAllByStatus("active").flatMap { connection ->
            taskListRepository.findAllByConnectionId(connection.id!!)
                .map { it.toView(connection.familyMemberId) }
        }

    fun saveSelection(
        memberId: UUID,
        taskListIds: List<String>,
        writeTargetId: String?,
    ) {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val lists = taskListRepository.findAllByConnectionId(connection.id!!)
        for (list in lists) {
            list.isSelected = list.googleTaskListId in taskListIds
            // Eine nicht ausgewählte Liste kann niemals Zielliste sein.
            list.isWriteTarget = list.isSelected && list.googleTaskListId == writeTargetId
            taskListRepository.save(list)
        }
    }

    fun syncForMember(memberId: UUID): TaskSyncResult {
        val connection =
            connectionRepository.findByFamilyMemberId(memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        return taskSyncService.syncConnection(connection)
    }
}
```

- [ ] **Step 4: Controller implementieren**

```kotlin
package com.familyhub.google.tasks

import com.familyhub.generated.api.GoogleTaskListsApi
import com.familyhub.generated.model.SelectedTaskListsRequest
import com.familyhub.generated.model.SyncResultResponse
import com.familyhub.generated.model.TaskListResponse
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class TaskListController(
    private val service: TaskListQueryService,
) : GoogleTaskListsApi {
    override fun listTaskLists(memberId: UUID?): ResponseEntity<List<TaskListResponse>> {
        val views = if (memberId == null) service.listAll() else service.listForMember(memberId)
        return ResponseEntity.ok(views.map { it.toResponse() })
    }

    @RequiresPinSession
    override fun saveSelectedTaskLists(selectedTaskListsRequest: SelectedTaskListsRequest): ResponseEntity<Unit> {
        service.saveSelection(
            memberId = selectedTaskListsRequest.memberId,
            taskListIds = selectedTaskListsRequest.taskListIds,
            writeTargetId = selectedTaskListsRequest.writeTargetId,
        )
        return ResponseEntity.ok().build()
    }

    override fun syncTaskLists(memberId: UUID): ResponseEntity<SyncResultResponse> {
        val r = service.syncForMember(memberId)
        return ResponseEntity.ok(SyncResultResponse(created = r.created, updated = r.updated, deleted = r.deleted))
    }
}

private fun TaskListView.toResponse() =
    TaskListResponse(
        id = id,
        title = title,
        isSelected = isSelected,
        isWriteTarget = isWriteTarget,
        memberId = memberId,
    )
```

Die exakten Signaturen der generierten `GoogleTaskListsApi`-Methoden nach `./gradlew openApiGenerate` prüfen und übernehmen — insbesondere, ob `memberId` als `UUID?` ankommt.

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskList*"`
Expected: PASS (14 Tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/tasks/TaskListQueryService.kt \
        backend/src/main/kotlin/com/familyhub/google/tasks/TaskListController.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskListQueryServiceTest.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskListControllerTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): expose task list selection and manual sync"
```

---

## Task 9: TaskService und TaskController

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskService.kt`
- Create: `backend/src/main/kotlin/com/familyhub/google/tasks/TaskController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskServiceTest.kt`
- Test: `backend/src/test/kotlin/com/familyhub/google/tasks/TaskControllerTest.kt`

**Interfaces:**
- Produces:
  - `data class TaskView(val id: UUID, val memberId: UUID, val title: String, val notes: String?, val dueDate: LocalDate?, val status: String, val priority: String?, val completedAt: Instant?)`
  - `data class CreateTaskCommand(val memberId: UUID, val title: String, val notes: String?, val dueDate: LocalDate?, val priority: String?)`
  - `data class UpdateTaskCommand(val title: String?, val notes: String?, val dueDate: LocalDate?, val priority: String?, val status: String?)`
  - `TaskService.list(memberId: UUID?): List<TaskView>`
  - `TaskService.create(cmd): TaskView`
  - `TaskService.update(id, cmd): TaskView`
  - `TaskService.delete(id): Unit`
  - `const val COMPLETED_RETENTION_DAYS = 30L`

- [ ] **Step 1: Failing Tests schreiben**

`TaskServiceTest.kt` (MockK):

```kotlin
@Test
fun `list returns pending tasks and recently completed ones`()
// Drei Tasks: offen; erledigt vor 5 Tagen; erledigt vor 40 Tagen
// → die ersten beiden kommen zurück, die dritte nicht

@Test
fun `list filters by member when a memberId is given`()

@Test
fun `list sorts by due date with undated tasks last and ties by title`()
// Erwartete Reihenfolge exakt prüfen

@Test
fun `create pushes to google before saving locally`()
// verifyOrder { tasksClient.insertTask(...); taskRepo.save(...) }

@Test
fun `create uses the write target list`()

@Test
fun `create falls back to the first selected list when no write target is set`()

@Test
fun `create throws when no selected list exists`()
// ValidationException("Keine Ziel-Aufgabenliste vorhanden")

@Test
fun `create throws when the member has no google connection`()
// ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

@Test
fun `create does not persist anything when google fails`()
// insertTask wirft → verify(exactly = 0) { taskRepo.save(any()) }

@Test
fun `update patches only the provided fields at google`()

@Test
fun `update keeps the priority local and never sends it to google`()
// Nur priority geändert → verify(exactly = 0) { tasksClient.patchTask(...) }
// und die Entity trägt die neue priority

@Test
fun `update to completed sets completedAt`()

@Test
fun `update to pending clears completedAt`()

@Test
fun `update throws when the task does not exist`()
// ResourceNotFoundException("Aufgabe nicht gefunden")

@Test
fun `delete removes the task at google and locally`()
// verifyOrder { tasksClient.deleteTask(...); taskRepo.delete(...) }

@Test
fun `delete does not remove locally when google fails`()
```

`TaskControllerTest.kt`:

```kotlin
@Test
fun `GET tasks returns the list`()

@Test
fun `POST tasks returns 201 with the created task`()

@Test
fun `PATCH tasks returns 200 with the updated task`()

@Test
fun `DELETE tasks returns 204`()

@Test
fun `GET tasks passes the memberId filter through`()
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskServiceTest" --tests "com.familyhub.google.tasks.TaskControllerTest"`
Expected: FAIL — Klassen existieren nicht.

- [ ] **Step 3: Service implementieren**

Kernpunkte, die der Test oben festnagelt:

```kotlin
package com.familyhub.google.tasks

import com.familyhub.google.connection.GoogleConnection
import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

/** Erledigte Aufgaben, die älter sind, werden nicht mehr ausgeliefert. */
const val COMPLETED_RETENTION_DAYS = 30L

data class TaskView(
    val id: UUID,
    val memberId: UUID,
    val title: String,
    val notes: String?,
    val dueDate: LocalDate?,
    val status: String,
    val priority: String?,
    val completedAt: Instant?,
)

data class CreateTaskCommand(
    val memberId: UUID,
    val title: String,
    val notes: String?,
    val dueDate: LocalDate?,
    val priority: String?,
)

data class UpdateTaskCommand(
    val title: String?,
    val notes: String?,
    val dueDate: LocalDate?,
    val priority: String?,
    val status: String?,
)

@Service
class TaskService(
    private val taskRepository: TaskRepository,
    private val taskListRepository: TaskListRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val tasksClient: GoogleTasksClient,
    private val mapper: TaskMapper,
    private val clock: Clock = Clock.systemUTC(),
) {
    fun list(memberId: UUID?): List<TaskView> {
        val cutoff = Instant.now(clock).minus(COMPLETED_RETENTION_DAYS, ChronoUnit.DAYS)
        val all = if (memberId == null) taskRepository.findAll() else taskRepository.findAllByOwnerMemberId(memberId)
        return all
            .filter { it.status == "pending" || isRecent(it.completedAt, cutoff) }
            .sortedWith(compareBy<Task> { it.dueDate ?: LocalDate.MAX }.thenBy { it.title })
            .map { it.toView() }
    }

    fun create(cmd: CreateTaskCommand): TaskView {
        val connection = requireConnection(cmd.memberId)
        val target = requireWriteTarget(connection)
        val googleTask = mapper.toGoogleTask(cmd.title, cmd.notes, cmd.dueDate, "pending")
        val inserted = tasksClient.insertTask(connection, target.googleTaskListId, googleTask)
        val entity = mapper.toEntity(inserted, target.id!!, cmd.memberId)
        entity.priority = cmd.priority
        return taskRepository.save(entity).toView()
    }

    fun update(
        id: UUID,
        cmd: UpdateTaskCommand,
    ): TaskView {
        val local = requireTask(id)
        // priority ist rein lokal — eine Änderung nur daran erreicht Google nie.
        if (cmd.title != null || cmd.notes != null || cmd.dueDate != null || cmd.status != null) {
            val connection = requireConnection(local.ownerMemberId)
            val list = requireList(local.taskListId)
            val patch = mapper.toGoogleTask(cmd.title, cmd.notes, cmd.dueDate, cmd.status)
            val patched = tasksClient.patchTask(connection, list.googleTaskListId, local.googleTaskId, patch)
            mapper.applyGoogleFields(local, patched)
        }
        if (cmd.priority != null) local.priority = cmd.priority
        return taskRepository.save(local).toView()
    }

    fun delete(id: UUID) {
        val local = requireTask(id)
        val connection = requireConnection(local.ownerMemberId)
        val list = requireList(local.taskListId)
        tasksClient.deleteTask(connection, list.googleTaskListId, local.googleTaskId)
        taskRepository.delete(local)
    }

    private fun isRecent(
        completedAt: Instant?,
        cutoff: Instant,
    ): Boolean = completedAt != null && completedAt.isAfter(cutoff)

    private fun requireTask(id: UUID) =
        taskRepository.findById(id).orElseThrow { ResourceNotFoundException("Aufgabe nicht gefunden") }

    private fun requireConnection(memberId: UUID): GoogleConnection =
        connectionRepository.findByFamilyMemberId(memberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

    private fun requireList(taskListId: UUID) =
        taskListRepository.findById(taskListId).orElseThrow {
            ResourceNotFoundException("Aufgabenliste nicht gefunden")
        }

    private fun requireWriteTarget(connection: GoogleConnection): TaskList {
        val lists = taskListRepository.findAllByConnectionIdAndIsSelectedTrue(connection.id!!)
        return lists.firstOrNull { it.isWriteTarget }
            ?: lists.firstOrNull()
            ?: throw ValidationException("Keine Ziel-Aufgabenliste vorhanden")
    }

    private fun Task.toView() =
        TaskView(
            id = id!!,
            memberId = ownerMemberId,
            title = title,
            notes = notes,
            dueDate = dueDate,
            status = status,
            priority = priority,
            completedAt = completedAt,
        )
}
```

**Hinweis zu `completedAt`:** Google liefert den Zeitstempel beim Abhaken selbst zurück, `applyGoogleFields` übernimmt ihn. Beim Zurücksetzen auf `pending` liefert Google `completed = null`, wodurch das Feld geleert wird — der Test `update to pending clears completedAt` prüft genau das.

- [ ] **Step 4: Controller implementieren**

```kotlin
package com.familyhub.google.tasks

import com.familyhub.generated.api.TasksApi
import com.familyhub.generated.model.CreateTaskRequest
import com.familyhub.generated.model.TaskResponse
import com.familyhub.generated.model.UpdateTaskRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api")
class TaskController(
    private val service: TaskService,
) : TasksApi {
    override fun listTasks(memberId: UUID?): ResponseEntity<List<TaskResponse>> =
        ResponseEntity.ok(service.list(memberId).map { it.toResponse() })

    override fun createTask(createTaskRequest: CreateTaskRequest): ResponseEntity<TaskResponse> {
        val view =
            service.create(
                CreateTaskCommand(
                    memberId = createTaskRequest.memberId,
                    title = createTaskRequest.title,
                    notes = createTaskRequest.notes,
                    dueDate = createTaskRequest.dueDate,
                    priority = createTaskRequest.priority?.value,
                ),
            )
        return ResponseEntity.status(HttpStatus.CREATED).body(view.toResponse())
    }

    override fun updateTask(
        id: UUID,
        updateTaskRequest: UpdateTaskRequest,
    ): ResponseEntity<TaskResponse> {
        val view =
            service.update(
                id,
                UpdateTaskCommand(
                    title = updateTaskRequest.title,
                    notes = updateTaskRequest.notes,
                    dueDate = updateTaskRequest.dueDate,
                    priority = updateTaskRequest.priority?.value,
                    status = updateTaskRequest.status?.value,
                ),
            )
        return ResponseEntity.ok(view.toResponse())
    }

    override fun deleteTask(id: UUID): ResponseEntity<Unit> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }
}

private fun TaskView.toResponse() =
    TaskResponse(
        id = id,
        memberId = memberId,
        title = title,
        status = TaskResponse.Status.forValue(status),
        notes = notes,
        dueDate = dueDate,
        priority = priority?.let { TaskResponse.Priority.forValue(it) },
        completedAt = completedAt?.toString(),
    )
```

**Enums aus dem Codegen:** `kotlin-spring` erzeugt für `enum:`-Felder verschachtelte Enum-Klassen (`TaskResponse.Status`, `TaskResponse.Priority`) mit `.value` und `forValue(...)`. Prüfe nach `./gradlew openApiGenerate` die tatsächlich erzeugten Namen und passe die Konvertierung an — der Rest des Controllers bleibt davon unberührt.

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `./gradlew test --tests "com.familyhub.google.tasks.TaskServiceTest" --tests "com.familyhub.google.tasks.TaskControllerTest"`
Expected: PASS (21 Tests)

- [ ] **Step 6: Phase B abschließen**

Run: `./gradlew check`
Expected: PASS. Der ArchUnit-Test muss ohne Anpassung grün sein — falls nicht, liegt eine Schichtverletzung vor (Controller greift auf ein Repository zu o. ä.); dann den Zugriff über den Service führen, **nicht** die Regel aufweichen.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/tasks/TaskService.kt \
        backend/src/main/kotlin/com/familyhub/google/tasks/TaskController.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskServiceTest.kt \
        backend/src/test/kotlin/com/familyhub/google/tasks/TaskControllerTest.kt \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add task CRUD writing through to Google Tasks"
```

---

# Phase C — Frontend-Aufgabenansicht

## Task 10: Reine Logikmodule

**Files:**
- Create: `frontend/src/features/tasks/dueDate.ts`
- Create: `frontend/src/features/tasks/taskSort.ts`
- Create: `frontend/src/features/tasks/progress.ts`
- Test: `frontend/src/features/tasks/dueDate.test.ts`
- Test: `frontend/src/features/tasks/taskSort.test.ts`
- Test: `frontend/src/features/tasks/progress.test.ts`

**Interfaces:**
- Produces:
  - `type DueTone = 'urgent' | 'overdue' | 'normal'`
  - `type DueLabel = { text: string; tone: DueTone }`
  - `formatDueDate(due: string | null | undefined, today: Date): DueLabel | null` — `dueDate` ist im Vertrag **nicht** `required`, orval erzeugt daraus `dueDate?: string | null`. Die Signatur muss `undefined` mit annehmen, sonst scheitert `tsc --noEmit`.
  - `type SortMode = 'due' | 'priority'`
  - `sortTasks(tasks: TaskResponse[], mode: SortMode): TaskResponse[]`
  - `type TaskFilter = 'all' | 'open' | 'done'`
  - `filterTasks(tasks: TaskResponse[], filter: TaskFilter): TaskResponse[]`
  - `taskProgress(tasks: TaskResponse[]): { done: number; total: number; percent: number }`

**Hier liegt der Schlüssel zur 100-%-Branch-Schwelle:** Diese drei Module enthalten praktisch jede Verzweigung des Features und lassen sich mit Tabellen-Tests erschöpfend abdecken. Die Komponenten in Task 11–14 bleiben dadurch fast verzweigungsfrei.

- [ ] **Step 1: Failing Tests für `dueDate.ts` schreiben**

```ts
import { formatDueDate } from './dueDate'

const today = new Date('2026-08-07T12:00:00Z')

describe('formatDueDate', () => {
  it('returns null for a null due date', () => {
    expect(formatDueDate(null, today)).toBeNull()
  })

  it('returns null for an undefined due date', () => {
    // orval erzeugt `dueDate?: string | null` — beide Nullfälle sind erreichbar
    // und damit beide Zweige des Guards testpflichtig.
    expect(formatDueDate(undefined, today)).toBeNull()
  })

  it('labels today', () => {
    expect(formatDueDate('2026-08-07', today)).toEqual({ text: 'Heute', tone: 'urgent' })
  })

  it('labels tomorrow', () => {
    expect(formatDueDate('2026-08-08', today)).toEqual({ text: 'Morgen', tone: 'urgent' })
  })

  it('labels a past date as overdue', () => {
    expect(formatDueDate('2026-08-06', today)).toEqual({ text: 'Überfällig', tone: 'overdue' })
  })

  it('formats a later date as day and short month', () => {
    expect(formatDueDate('2026-08-20', today)).toEqual({ text: '20. Aug', tone: 'normal' })
  })

  it('formats a date in the next year', () => {
    expect(formatDueDate('2027-01-03', today)).toEqual({ text: '03. Jan', tone: 'normal' })
  })
})
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm run test:run -- src/features/tasks/dueDate.test.ts`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: `dueDate.ts` implementieren**

```ts
export type DueTone = 'urgent' | 'overdue' | 'normal'
export type DueLabel = { text: string; tone: DueTone }

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Tagesdifferenz in UTC — beide Seiten auf Mitternacht normalisiert. */
function daysBetween(due: string, today: Date): number {
  const [y, m, d] = due.split('-').map(Number)
  const dueUtc = Date.UTC(y, m - 1, d)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((dueUtc - todayUtc) / 86_400_000)
}

export function formatDueDate(due: string | null | undefined, today: Date): DueLabel | null {
  if (due === null || due === undefined) return null
  const diff = daysBetween(due, today)
  if (diff === 0) return { text: 'Heute', tone: 'urgent' }
  if (diff === 1) return { text: 'Morgen', tone: 'urgent' }
  if (diff < 0) return { text: 'Überfällig', tone: 'overdue' }
  const [, month, day] = due.split('-')
  return { text: `${day}. ${MONTHS[Number(month) - 1]}`, tone: 'normal' }
}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npm run test:run -- src/features/tasks/dueDate.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: `taskSort.ts` mit Tests bauen**

Test zuerst; diese Fälle:

```ts
describe('sortTasks', () => {
  it('sorts by due date ascending')
  it('puts tasks without a due date last')
  it('breaks ties by title')
  it('sorts by priority high, medium, low when mode is priority')
  it('puts tasks without a priority last in priority mode')
  it('breaks priority ties by title')
  it('returns a new array and leaves the input untouched')
})

describe('filterTasks', () => {
  it('returns everything for all')
  it('returns only pending tasks for open')
  it('returns only completed tasks for done')
})
```

Implementierung:

```ts
import type { TaskResponse } from '@/api/generated/model'

export type SortMode = 'due' | 'priority'
export type TaskFilter = 'all' | 'open' | 'done'

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

function byDue(a: TaskResponse, b: TaskResponse): number {
  // '9999-12-31' sortiert datumslose Aufgaben ans Ende, ohne einen Extra-Zweig zu brauchen.
  const left = a.dueDate ?? '9999-12-31'
  const right = b.dueDate ?? '9999-12-31'
  return left === right ? a.title.localeCompare(b.title, 'de') : left.localeCompare(right)
}

function byPriority(a: TaskResponse, b: TaskResponse): number {
  const left = PRIORITY_RANK[a.priority ?? ''] ?? 3
  const right = PRIORITY_RANK[b.priority ?? ''] ?? 3
  return left === right ? a.title.localeCompare(b.title, 'de') : left - right
}

export function sortTasks(tasks: TaskResponse[], mode: SortMode): TaskResponse[] {
  return [...tasks].sort(mode === 'due' ? byDue : byPriority)
}

export function filterTasks(tasks: TaskResponse[], filter: TaskFilter): TaskResponse[] {
  if (filter === 'open') return tasks.filter((t) => t.status === 'pending')
  if (filter === 'done') return tasks.filter((t) => t.status === 'completed')
  return tasks
}
```

**Achtung Branch-Coverage:** `a.dueDate ?? '…'` und `PRIORITY_RANK[…] ?? 3` sind Zweige. Die Tests „puts tasks without a due date last" und „puts tasks without a priority last in priority mode" müssen **beide** Seiten treffen — also je mindestens eine Aufgabe mit und eine ohne Wert enthalten.

- [ ] **Step 6: `progress.ts` mit Tests bauen**

```ts
export function taskProgress(tasks: TaskResponse[]): { done: number; total: number; percent: number } {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'completed').length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}
```

Tests: leere Liste → `{done:0,total:0,percent:0}`; alle erledigt → 100; 1 von 3 → 33; keine erledigt → 0.

- [ ] **Step 7: Alle drei Testdateien grün**

Run: `npm run test:run -- src/features/tasks/`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/tasks/ docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add pure due-date, sort and progress helpers"
```

---

## Task 11: Query-Hooks

**Files:**
- Create: `frontend/src/features/tasks/useTasks.ts`
- Create: `frontend/src/features/tasks/useTaskSync.ts`
- Test: `frontend/src/features/tasks/useTaskSync.test.tsx`

**Interfaces:**
- Produces:
  - `useTasks(): { tasks: TaskResponse[]; isLoading: boolean; isError: boolean }`
  - `useCreateTaskMutation()`, `useUpdateTaskMutation()`, `useDeleteTaskMutation()` — je mit Invalidierung von `getListTasksQueryKey()`
  - `useTaskSync(): { sync: () => Promise<void>; isSyncing: boolean; isError: boolean }`

- [ ] **Step 1: `useTasks.ts` schreiben**

Muster exakt aus `frontend/src/features/google/useCalendars.ts` übernehmen:

```ts
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { TaskResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useTasks() {
  const query = useListTasks()
  return {
    tasks: (query.data?.data ?? []) as TaskResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient()
  return useCreateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient()
  return useUpdateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient()
  return useDeleteTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}
```

- [ ] **Step 2: Failing Test für `useTaskSync` schreiben**

`useTaskSync.test.tsx` — Muster aus einem bestehenden Hook-Test übernehmen; `syncTaskLists` und `useGoogleConnections` mocken. Fälle:

```ts
it('syncs each connected member once')          // zwei Verbindungen, zwei Aufrufe
it('skips revoked connections')                 // status REVOKED → kein Aufruf
it('deduplicates members with several connections')
it('sets isError when one sync rejects')
it('sets isError when the whole call throws')
it('resets isSyncing when finished')
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm run test:run -- src/features/tasks/useTaskSync.test.tsx`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 4: `useTaskSync.ts` implementieren**

Struktur 1:1 aus `frontend/src/features/calendar/useCalendarSync.ts` übernehmen; statt `syncCalendars` wird `syncTaskLists` aufgerufen und statt `getListEventsQueryKey()` wird `getListTasksQueryKey()` invalidiert.

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `npm run test:run -- src/features/tasks/useTaskSync.test.tsx`
Expected: PASS (6 Tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/tasks/useTasks.ts \
        frontend/src/features/tasks/useTaskSync.ts \
        frontend/src/features/tasks/useTaskSync.test.tsx \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add task query hooks and manual sync"
```

---

## Task 12: ProgressRing und TaskRow

**Files:**
- Create: `frontend/src/features/tasks/ProgressRing.tsx`
- Create: `frontend/src/features/tasks/TaskRow.tsx`
- Test: `frontend/src/features/tasks/ProgressRing.test.tsx`
- Test: `frontend/src/features/tasks/TaskRow.test.tsx`

**Interfaces:**
- Produces:
  - `ProgressRing({ percent }: { percent: number })`
  - `TaskRow({ task, color, today, onToggle, onEdit }: { task: TaskResponse; color: string; today: Date; onToggle: (task: TaskResponse) => void; onEdit: (task: TaskResponse) => void })`

`today` wird **als Prop hereingereicht**, nicht in der Komponente aus `new Date()` gelesen — sonst sind die Fälligkeits-Zweige nicht deterministisch testbar.

- [ ] **Step 1: Failing Tests schreiben**

`ProgressRing.test.tsx`:

```tsx
it('renders the percentage as text')            // percent={42} → "42 %"
it('renders a full ring at 100 percent')
it('renders an empty ring at 0 percent')
```

`TaskRow.test.tsx`:

```tsx
it('renders the title')
it('renders notes when present')
it('renders no notes line when notes are null')
it('renders the due label when a due date is set')
it('renders no due label without a due date')
it('renders three stars for high priority')
it('renders two stars for medium priority')
it('renders one star for low priority')
it('renders no stars without a priority')
it('strikes through and dims a completed task')
it('calls onToggle when the checkbox is pressed')
it('calls onEdit when the edit button is pressed')
```

Die Checkbox ist ein `<button>` mit `aria-label={task.title}` und `aria-pressed={task.status === 'completed'}` — dadurch ist der Zustand ohne Klassen-Assertions prüfbar.

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm run test:run -- src/features/tasks/ProgressRing.test.tsx src/features/tasks/TaskRow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Komponenten implementieren**

`ProgressRing.tsx` — verzweigungsfrei, damit die Branch-Schwelle hier nichts kostet:

```tsx
const SIZE = 48
const STROKE = 5
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressRing({ percent }: { percent: number }) {
  const offset = CIRCUMFERENCE * (1 - percent / 100)
  return (
    <svg width={SIZE} height={SIZE} role="img" aria-label={`${percent} % erledigt`}>
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
        fill="none" strokeWidth={STROKE} className="stroke-subtle"
      />
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
        fill="none" strokeWidth={STROKE} strokeLinecap="round" className="stroke-accent"
        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
      <text
        x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        className="fill-current text-primary text-xs font-semibold"
      >
        {percent} %
      </text>
    </svg>
  )
}
```

Gibt es keine Tailwind-Klasse `stroke-subtle`/`stroke-accent`, ergänze sie in `tailwind.config.ts` analog den bestehenden Token-Aliassen — **kein** hartcodierter Farbwert.

`TaskRow.tsx` — Aufbau:

```tsx
import { Pencil, Calendar } from 'lucide-react'
import type { TaskResponse } from '@/api/generated/model'
import { formatDueDate } from './dueDate'

const STAR_COUNT: Record<string, number> = { high: 3, medium: 2, low: 1 }
const TONE_CLASS = { urgent: 'text-warn font-semibold', overdue: 'text-danger font-semibold', normal: 'text-muted' }

type TaskRowProps = {
  task: TaskResponse
  color: string
  today: Date
  onToggle: (task: TaskResponse) => void
  onEdit: (task: TaskResponse) => void
}

export function TaskRow({ task, color, today, onToggle, onEdit }: TaskRowProps) {
  const due = formatDueDate(task.dueDate, today)
  const stars = STAR_COUNT[task.priority ?? ''] ?? 0
  const done = task.status === 'completed'
  return (
    <li className="flex items-start gap-3 py-1">
      <button
        type="button"
        aria-label={task.title}
        aria-pressed={done}
        onClick={() => onToggle(task)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <span
          className="w-7 h-7 rounded-full border-4 flex items-center justify-center"
          style={{ borderColor: color, backgroundColor: done ? color : 'transparent' }}
        />
      </button>

      <span className="flex-1 pt-2">
        <span className={done ? 'line-through text-muted' : 'text-primary'}>{task.title}</span>
        {task.notes && <span className="block text-sm text-muted">{task.notes}</span>}
        {(due || stars > 0) && (
          <span className="flex items-center gap-3 text-sm">
            {due && (
              <span className={TONE_CLASS[due.tone]}>
                <Calendar aria-hidden className="inline w-4 h-4 mr-1" />
                {due.text}
              </span>
            )}
            {stars > 0 && <span aria-label={`Priorität ${task.priority}`}>{'⭐'.repeat(stars)}</span>}
          </span>
        )}
      </span>

      <button
        type="button"
        aria-label={`${task.title} bearbeiten`}
        onClick={() => onEdit(task)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted"
      >
        <Pencil aria-hidden />
      </button>
    </li>
  )
}
```

**Branch-Buchhaltung für diese Komponente** — jeder dieser Zweige braucht einen Test auf **beiden** Seiten, und die Testliste aus Step 1 deckt genau sie ab: `task.priority ?? ''`, `?? 0`, `done ? … : …` (zweimal), `task.notes &&`, `due || stars > 0`, `due &&`, `stars > 0 &&`.

Pflichten aus den Global Constraints: Abhak-Button `min-h-[44px] min-w-[44px]`, Bearbeiten-Button `min-h-[44px] min-w-[44px]` und **permanent sichtbar** (kein `opacity-0 group-hover:opacity-100`). Erledigte Aufgaben: `line-through text-muted`.

**Branch-Warnung:** `task.priority ?? ''` und `?? 0` sind zwei Zweige; die Tests „renders no stars without a priority" und die drei Sternentests decken beide Seiten ab. `TONE_CLASS[due.tone]` braucht keinen Fallback, weil `DueTone` erschöpfend ist — **füge keinen hinzu**, er wäre nicht testbar.

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `npm run test:run -- src/features/tasks/ProgressRing.test.tsx src/features/tasks/TaskRow.test.tsx`
Expected: PASS (15 Tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/tasks/ProgressRing.tsx \
        frontend/src/features/tasks/TaskRow.tsx \
        frontend/src/features/tasks/ProgressRing.test.tsx \
        frontend/src/features/tasks/TaskRow.test.tsx \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add progress ring and task row"
```

---

## Task 13: TaskDialog

**Files:**
- Create: `frontend/src/features/tasks/TaskDialog.tsx`
- Test: `frontend/src/features/tasks/TaskDialog.test.tsx`

**Interfaces:**
- Produces: `TaskDialog({ task, memberId, onClose }: { task: TaskResponse | null; memberId: string; onClose: () => void })` — `task === null` bedeutet „neu anlegen".

**Deutsche Oberflächentexte, wortwörtlich:**

| Element | Text |
|---|---|
| Titel (neu) | `Neue Aufgabe` |
| Titel (bearbeiten) | `Aufgabe bearbeiten` |
| Feld 1 | Label `Aufgabe`, Platzhalter `z. B. Einkaufen gehen` |
| Feld 2 | Label `Fällig am` (`<input type="date">`) |
| Feld 3 | Label `Priorität`, drei Umschaltflächen `Niedrig`, `Mittel`, `Hoch` |
| Feld 4 | Label `Notizen (optional)`, Platzhalter `Zusätzliche Details…` |
| Buttons | `Löschen` (nur beim Bearbeiten), `Abbrechen`, `Hinzufügen` / `Speichern`, während des Speicherns `Speichern…` |
| Fehler | `Speichern fehlgeschlagen.` |

Voreinstellung der Priorität beim Anlegen: `Mittel`.

- [ ] **Step 1: Failing Test schreiben**

```tsx
it('shows the create title and default priority')
it('shows the edit title and prefills every field')
it('hides the delete button when creating')
it('shows the delete button when editing')
it('creates a task with the entered values')
it('creates a task without a due date when the field stays empty')
it('updates a task when editing')
it('deletes a task')
it('calls onClose when cancel is pressed')
it('shows the saving label while the mutation is pending')
it('shows an error message when saving fails')
it('does not submit an empty title')
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npm run test:run -- src/features/tasks/TaskDialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: Dialog implementieren**

Overlay, Karte in `bg-surface`, Fokusverhalten und Button-Reihe **aus `frontend/src/features/calendar/EventDialog.tsx` übernehmen** — lies die Datei und spiegele ihren Aufbau, damit beide Dialoge gleich aussehen und sich gleich verhalten. Der fachliche Kern:

```tsx
const PRIORITIES = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
]

export function TaskDialog({ task, memberId, onClose }: TaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [priority, setPriority] = useState(task?.priority ?? 'medium')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [failed, setFailed] = useState(false)

  const createMutation = useCreateTaskMutation()
  const updateMutation = useUpdateTaskMutation()
  const deleteMutation = useDeleteTaskMutation()
  const isSaving = createMutation.isPending || updateMutation.isPending

  async function handleSubmit() {
    setFailed(false)
    // Leere Datumseingabe heißt "keine Fälligkeit", nicht "Fälligkeit ''".
    const data = { title: title.trim(), notes, dueDate: dueDate === '' ? null : dueDate, priority }
    try {
      if (task === null) {
        await createMutation.mutateAsync({ data: { ...data, memberId } })
      } else {
        await updateMutation.mutateAsync({ id: task.id, data })
      }
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleDelete() {
    setFailed(false)
    try {
      await deleteMutation.mutateAsync({ id: task!.id })
      onClose()
    } catch {
      setFailed(true)
    }
  }
  // … Markup mit den Texten aus der Tabelle oben
}
```

Leerer Titel deaktiviert die Speichern-Schaltfläche: `disabled={title.trim() === '' || isSaving}`.

**Branch-Buchhaltung:** `task?.title ?? ''` und die drei Geschwister (vier Zweige — je ein Test mit und ohne `task`), `task === null` im Submit, `dueDate === '' ? null : dueDate`, `isSaving`, `failed`, `title.trim() === ''`. Die zwölf Tests aus Step 1 treffen jede Seite; der Test `creates a task without a due date when the field stays empty` ist der, der sonst am ehesten vergessen wird.

`task!.id` in `handleDelete` ist sicher, weil die Löschen-Schaltfläche nur beim Bearbeiten gerendert wird — verwende genau diese Non-Null-Assertion statt eines zusätzlichen Guards, der als unerreichbarer Zweig die Coverage bricht.

Beim Anlegen wird `memberId` aus den Props übernommen — es gibt **keine** Personenauswahl im Dialog, weil das Mitglied durch die Karte bestimmt ist, aus der der Dialog geöffnet wurde (Owner = Mitglied der Google-Verbindung).

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `npm run test:run -- src/features/tasks/TaskDialog.test.tsx`
Expected: PASS (12 Tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/tasks/TaskDialog.tsx \
        frontend/src/features/tasks/TaskDialog.test.tsx \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add task dialog with due date field"
```

---

## Task 14: MemberTaskCard, TaskFilterBar, TasksView

**Files:**
- Create: `frontend/src/features/tasks/MemberTaskCard.tsx`
- Create: `frontend/src/features/tasks/TaskFilterBar.tsx`
- Create: `frontend/src/features/tasks/TasksView.tsx`
- Test: `frontend/src/features/tasks/MemberTaskCard.test.tsx`
- Test: `frontend/src/features/tasks/TaskFilterBar.test.tsx`
- Test: `frontend/src/features/tasks/TasksView.test.tsx`

**Interfaces:**
- Produces:
  - `TaskFilterBar({ filter, counts, onChange }: { filter: TaskFilter; counts: { all: number; open: number; done: number }; onChange: (f: TaskFilter) => void })`
  - `MemberTaskCard({ member, tasks, filter, sortMode, today, onToggle, onEdit, onAdd })`
  - `TasksView()`

**Deutsche Oberflächentexte, wortwörtlich:**

| Element | Text |
|---|---|
| Überschrift | `Aufgaben` |
| Zusammenfassung | `{erledigt} von {gesamt} erledigt` |
| Filter | `Alle`, `Offen`, `Erledigt` (je mit Zähler) |
| Sortierung | `Nach Fälligkeit`, `Nach Priorität` |
| Ladezustand | `Wird geladen…` |
| Fehler | `Fehler beim Laden der Aufgaben.` + Schaltfläche `Erneut versuchen` |
| Karte ohne Aufgaben | `Keine Aufgaben` |
| Kein Konto verbunden | `Kein Google-Konto verbunden. Aufgaben werden aus Google Tasks synchronisiert.` |
| Sync fehlgeschlagen | `Synchronisierung fehlgeschlagen.` |
| Karten-Untertitel | `{erledigt}/{gesamt} erledigt` |
| Hinzufügen-Button | `aria-label="Aufgabe hinzufügen"` |

Voreinstellung des Filters ist **`Offen`**; die Zähler beziehen sich immer auf den **Gesamtbestand** (FA-AUF-06) — sie kommen aus `taskProgress` über die ungefilterte Liste, nicht über die angezeigte Teilmenge.

- [ ] **Step 1: Failing Tests für `TaskFilterBar` schreiben**

```tsx
it('renders all three filters with their counts')
it('marks the active filter with aria-pressed')
it('calls onChange for each filter')     // drei fireEvent.click, drei Erwartungen
```

- [ ] **Step 2: `TaskFilterBar` implementieren und Test grün bekommen**

```tsx
import type { TaskFilter } from './taskSort'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'done', label: 'Erledigt' },
]

type TaskFilterBarProps = {
  filter: TaskFilter
  counts: { all: number; open: number; done: number }
  onChange: (f: TaskFilter) => void
}

export function TaskFilterBar({ filter, counts, onChange }: TaskFilterBarProps) {
  return (
    <div className="flex gap-2">
      {FILTERS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => onChange(value)}
          className={`min-h-[44px] px-4 rounded-full ${
            filter === value ? 'bg-accent text-white' : 'bg-surface text-primary'
          }`}
        >
          {label} {counts[value]}
        </button>
      ))}
    </div>
  )
}
```

Run: `npm run test:run -- src/features/tasks/TaskFilterBar.test.tsx`
Expected: PASS

- [ ] **Step 3: Failing Tests für `MemberTaskCard` schreiben**

```tsx
it('renders the member name and the completion subtitle')
it('renders the avatar image when the member has one')
it('renders the initial letter when the member has no avatar')
it('renders the empty state when the member has no tasks')
it('renders the empty state when the filter removes every task')
it('renders one row per task after filtering')
it('sorts rows by the given sort mode')
it('calls onAdd with the member id')
```

- [ ] **Step 4: `MemberTaskCard` implementieren und Test grün bekommen**

Kopfzeile in Mitgliedsfarbe über `memberColorHex(member.color)` aus `@/features/members/colors` (Inline-`style={{ backgroundColor: … }}`, das etablierte Muster). Rechts der `ProgressRing`. Darunter `filterTasks` → `sortTasks` → je Aufgabe eine `TaskRow`.

- [ ] **Step 5: Failing Tests für `TasksView` schreiben**

Die Hooks werden per `vi.mock` ersetzt — Muster exakt aus `frontend/src/features/google/GoogleAccountsSettings.test.tsx` (`vi.mock` oben, `vi.mocked(...).mockReturnValue(... as never)` im `beforeEach`).

```tsx
it('shows the loading state')
it('shows the error state with a retry button')
it('retries loading when the retry button is pressed')
it('shows the hint when no google account is connected')
it('renders one card per member with a connection')
it('does not render a card for members without a connection')
it('shows the overall summary')
it('defaults to the open filter')
it('switches the filter and updates the shown tasks')
it('counts always refer to the full set, not the filtered subset')
it('switches the sort mode')
it('opens the dialog for a new task')
it('opens the dialog for an existing task')
it('toggles a task via the row checkbox')
it('triggers a sync and shows the syncing state')
it('shows an error when the sync fails')
```

Der Test `counts always refer to the full set` ist der Wächter für FA-AUF-06: Filter auf `Erledigt` stellen und prüfen, dass der Zähler an `Offen` unverändert bleibt.

- [ ] **Step 6: `TasksView` implementieren und Tests grün bekommen**

Gerüst — die Zählerbildung ist der Teil, der FA-AUF-06 trägt und deshalb ausgeschrieben ist:

```tsx
export function TasksView() {
  const { tasks, isLoading, isError } = useTasks()
  const { members } = useMembers()
  const { connections } = useGoogleConnections()
  const { sync, isSyncing, isError: syncFailed } = useTaskSync()
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [sortMode, setSortMode] = useState<SortMode>('due')
  const [dialogFor, setDialogFor] = useState<{ memberId: string; task: TaskResponse | null } | null>(null)
  const updateMutation = useUpdateTaskMutation()
  const today = new Date()

  // Zähler IMMER über den Gesamtbestand — nie über die gefilterte Teilmenge (FA-AUF-06).
  const { done, total } = taskProgress(tasks)
  const counts = { all: total, open: total - done, done }

  // Nur Mitglieder mit Google-Verbindung bekommen eine Karte: Owner = Mitglied der Verbindung.
  const memberIdsWithConnection = new Set(connections.map((c) => c.memberId))
  const cardMembers = members.filter((m) => memberIdsWithConnection.has(m.id))

  function handleToggle(task: TaskResponse) {
    const next = task.status === 'completed' ? 'pending' : 'completed'
    void updateMutation.mutateAsync({ id: task.id, data: { status: next } })
  }
  // … Markup mit den Texten aus der Tabelle oben
}
```

`today` wird einmal hier erzeugt und an die Karten weitergereicht — die Tests der reinen Module und von `TaskRow` decken die Datumslogik deterministisch ab, `TasksView` reicht den Wert nur durch.

Run: `npm run test:run -- src/features/tasks/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/tasks/ docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): add member cards, filter bar and tasks view"
```

---

## Task 15: Bereichsnavigation und Route

**Files:**
- Modify: `frontend/src/routing/AppShell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routing/AppShell.test.tsx`

**Interfaces:**
- Produces: `AppShell` rendert oberhalb der Kinder eine Navigationsleiste mit `Kalender` (`/`), `Aufgaben` (`/tasks`) und `Einstellungen` (`/settings`).

- [ ] **Step 1: Failing Tests schreiben**

In `AppShell.test.tsx` ergänzen:

```tsx
it('renders links to calendar, tasks and settings')
it('marks the current section with aria-current')       // mit route: '/tasks' rendern
it('marks the calendar link as current on the root route')
it('marks the settings link as current on the settings route')
```

`renderWithProviders(ui, { route: '/tasks' })` aus `@/test/testUtils` benutzt bereits einen `MemoryRouter` — die Route lässt sich also direkt setzen.

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm run test:run -- src/routing/AppShell.test.tsx`
Expected: FAIL — es gibt noch keine Navigation.

- [ ] **Step 3: Navigation implementieren**

```tsx
import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from '@/features/google/RevokedConnectionSnackbars'

const SECTIONS = [
  { to: '/', label: 'Kalender' },
  { to: '/tasks', label: 'Aufgaben' },
  { to: '/settings', label: 'Einstellungen' },
]

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider>
      <div className="min-h-screen bg-bg">
        <nav className="flex gap-2 p-2 border-b border-subtle bg-surface">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end
              className={({ isActive }) =>
                `min-h-[44px] px-4 flex items-center rounded-xl text-lg ${
                  isActive ? 'bg-accent text-white' : 'text-primary'
                }`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        {children}
      </div>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>
  )
}
```

`NavLink` setzt `aria-current="page"` selbst — die Tests prüfen genau das. Die `isActive`-Verzweigung in der Klassenfunktion ist ein Branch; die Tests „marks the current section" und „marks the calendar link as current" decken beide Seiten ab.

- [ ] **Step 4: Route ergänzen**

In `frontend/src/App.tsx` nach der `/`-Route:

```tsx
        <Route
          path="/tasks"
          element={
            <SetupGuard>
              <AppShell>
                <TasksView />
              </AppShell>
            </SetupGuard>
          }
        />
```

samt Import `import { TasksView } from '@/features/tasks/TasksView'`.

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `npm run test:run -- src/routing/AppShell.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Phase C abschließen**

Run: `npm run check`
Expected: PASS — insbesondere die **branches-100-Schwelle**. Bleibt sie rot, zeigt der Coverage-Report die unbedeckte Zeile; ergänze den fehlenden Test, statt die Schwelle zu senken oder den Zweig mit `/* v8 ignore */` zu verstecken.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routing/AppShell.tsx frontend/src/routing/AppShell.test.tsx \
        frontend/src/App.tsx \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(routing): add section navigation and the tasks route"
```

---

# Phase D — Einstellungen, Scope-Hinweis, Abschluss

## Task 16: Scope-Erkennung und Hinweis

**Files:**
- Create: `frontend/src/features/tasks/tasksScope.ts`
- Create: `frontend/src/features/tasks/TasksScopeNotice.tsx`
- Test: `frontend/src/features/tasks/tasksScope.test.ts`
- Test: `frontend/src/features/tasks/TasksScopeNotice.test.tsx`
- Modify: `frontend/src/features/tasks/TasksView.tsx` (Hinweis einhängen)

**Interfaces:**
- Produces:
  - `export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'`
  - `hasTasksScope(connection: ConnectionResponse): boolean`
  - `connectionsMissingTasksScope(connections: ConnectionResponse[]): ConnectionResponse[]`
  - `TasksScopeNotice({ connections }: { connections: ConnectionResponse[] })` — rendert `null`, wenn keine Verbindung betroffen ist

**Deutsche Texte, wortwörtlich:**
- `Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.`
- Schaltfläche: `Konto neu verbinden`

- [ ] **Step 1: Failing Tests schreiben**

`tasksScope.test.ts`:

```ts
it('reports true when the tasks scope is present')
it('reports false when only the calendar scope is present')
it('reports false for an empty scope list')
it('returns every connection missing the scope')
it('returns an empty array when all connections have the scope')
```

`TasksScopeNotice.test.tsx`:

```tsx
it('renders nothing when every connection has the scope')
it('names each affected account')
it('starts the OAuth flow for the affected member when reconnect is pressed')
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `npm run test:run -- src/features/tasks/tasksScope.test.ts src/features/tasks/TasksScopeNotice.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implementieren**

```ts
import type { ConnectionResponse } from '@/api/generated/model'

/** Muss mit TASKS_SCOPE in backend/.../google/oauth/GoogleOAuthFlow.kt übereinstimmen. */
export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'

export function hasTasksScope(connection: ConnectionResponse): boolean {
  return connection.scopes.includes(TASKS_SCOPE)
}

export function connectionsMissingTasksScope(connections: ConnectionResponse[]): ConnectionResponse[] {
  return connections.filter((c) => !hasTasksScope(c))
}
```

`TasksScopeNotice.tsx` nutzt `useStartGoogleAuth` aus `@/features/google/useCalendars` und leitet mit `window.location.href = url` weiter — dasselbe Muster wie `GoogleAccountsSettings.tsx`. Der `memberId`-Parameter wird mitgegeben, damit die Verbindung am richtigen Mitglied hängt.

- [ ] **Step 4: Hinweis in `TasksView` einhängen**

Direkt unter der Kopfzeile rendern. Die zugehörigen `TasksView`-Tests ergänzen:

```tsx
it('shows the scope notice when a connection lacks the tasks scope')
it('does not show the scope notice when every connection has it')
```

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `npm run test:run -- src/features/tasks/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/tasks/ docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(tasks): prompt to reconnect accounts missing the tasks scope"
```

---

## Task 17: Einstellungen — Aufgabenlisten

**Files:**
- Create: `frontend/src/features/tasks/useTaskLists.ts`
- Create: `frontend/src/features/google/TaskListSection.tsx`
- Test: `frontend/src/features/google/TaskListSection.test.tsx`
- Modify: `frontend/src/features/settings/SettingsView.tsx`

**Interfaces:**
- Produces:
  - `useTaskListsForMember(memberId: string): { taskLists: TaskListResponse[]; isLoading: boolean; isError: boolean }`
  - `useAllTaskLists(): { taskLists: TaskListResponse[]; isLoading: boolean; isError: boolean }`
  - `useSaveSelectedTaskListsMutation()`
  - `TaskListSection()`

**Deutsche Texte, wortwörtlich:**

| Element | Text |
|---|---|
| Sektionskopf | `Aufgabenlisten · {n} ausgewählt` |
| Kein Konto | `Keine Google-Konten verbunden.` |
| Laden | `Wird geladen…` |
| Fehler | `Fehler beim Laden der Aufgabenlisten.` |
| Leer | `Keine Aufgabenlisten gefunden.` |
| Unterüberschrift je Konto | `{name} – Aufgabenlisten` |
| Zielliste (Radio) | `Zielliste`, `aria-label="Zielliste für neue Aufgaben"` |
| Speichern | `Speichern` |

- [ ] **Step 1: `useTaskLists.ts` schreiben**

Exakt nach dem Muster von `useCalendars.ts` (siehe Task 11), mit `useListTaskLists`, `useSaveSelectedTaskLists`, `getListTaskListsQueryKey`.

- [ ] **Step 2: Failing Test schreiben**

`TaskListSection.test.tsx` — Hooks per `vi.mock`, Muster aus `GoogleAccountsSettings.test.tsx`:

```tsx
it('shows the loading state')
it('shows the error state')
it('shows the hint when no account is connected')
it('renders the selected count in the header')
it('is collapsed by default and expands on click')
it('lists every task list of a connection')
it('shows the empty state when a connection has no lists')
it('shows the error state when the lists of a connection fail to load')
it('toggles a list selection')
it('selects a write target')
it('saves the selection')
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npm run test:run -- src/features/google/TaskListSection.test.tsx`
Expected: FAIL

- [ ] **Step 4: `TaskListSection.tsx` implementieren**

Struktur 1:1 aus `frontend/src/features/google/CalendarSection.tsx` übernehmen: äußere `<section>` mit aufklappbarem Kopf (`aria-expanded`), darin je Verbindung eine innere Komponente mit Checkbox-Liste, Radio für die Zielliste (`name={`write-target-tasks-${connection.connectionId}`}`) und Speichern-Schaltfläche. Lokaler `selectedIds`-Zustand mit `useEffect`-Sync auf die geladenen Daten — genau wie dort.

- [ ] **Step 5: In `SettingsView` einhängen**

Direkt unter der bestehenden `<CalendarSection />` einfügen. Den `SettingsView`-Test um eine Assertion ergänzen, dass die Sektionsüberschrift erscheint.

- [ ] **Step 6: Tests laufen lassen — müssen grün sein**

Run: `npm run test:run -- src/features/google/TaskListSection.test.tsx src/features/settings/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/tasks/useTaskLists.ts \
        frontend/src/features/google/TaskListSection.tsx \
        frontend/src/features/google/TaskListSection.test.tsx \
        frontend/src/features/settings/SettingsView.tsx \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "feat(settings): add task list selection section"
```

---

## Task 18: E2E-Test und Abschluss

**Files:**
- Create: `frontend/e2e/tasks.spec.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: E2E-Test schreiben**

`frontend/e2e/tasks.spec.ts` — Aufbau und Backend-Behandlung exakt aus `frontend/e2e/calendar.spec.ts` übernehmen (dort steht, wie der Zustand für den Testlauf hergestellt wird; folge demselben Weg, erfinde keinen neuen).

Abgedeckt werden:

```ts
test('navigates to the tasks section')
test('creates a task and sees it in the list')
test('checks a task off and sees it struck through')
test('switches the filter to Erledigt and back to Offen')
```

- [ ] **Step 2: E2E-Test laufen lassen**

Run: `npm run test:e2e -- tasks.spec.ts`
Expected: PASS

- [ ] **Step 3: `CLAUDE.md` aktualisieren**

Im Abschnitt „Recommended build order":
- Zeile 5 auf `5. ✅ Tasks + Google Tasks sync` setzen,
- Zeile 6 mit `← *current*` markieren.

Im Abschnitt „Repository status": den Satz auf Sprint 5 fortschreiben und die letzte Migration von `V10` auf `V11` korrigieren.

Im Abschnitt „Code layout": das neue Backend-Package `tasks` in die `google/{…}`-Aufzählung aufnehmen und `tasks` bei den Frontend-Features ergänzen.

- [ ] **Step 4: Vollgate laufen lassen**

Run: `scripts/pre-commit-check.sh`
Expected: PASS — Backend `./gradlew check` **und** Frontend `npm run check` grün.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/tasks.spec.ts CLAUDE.md \
        docs/superpowers/plans/2026-08-07-schritt5-aufgaben-google-tasks.md
git commit -m "test(tasks): add end-to-end coverage and update project docs"
```

---

## Definition of Done

Der Sprint ist fertig, wenn alle folgenden Punkte belegt sind — **nicht behauptet, sondern mit Befehlsausgabe belegt**:

1. Ein Google-Konto lässt sich mit Tasks-Scope verbinden; bestehende Konten zeigen den Hinweis `Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.`
2. Aufgabenlisten sind in den Einstellungen auswählbar, eine davon ist Zielliste.
3. `/tasks` ist über die Bereichsnavigation erreichbar und zeigt je verbundenem Mitglied eine Karte mit Fortschrittsring.
4. Aufgaben lassen sich anlegen, bearbeiten, abhaken und löschen — jeweils bei Google sichtbar.
5. Der geplante Sync läuft; Änderungen aus Google erscheinen innerhalb eines Intervalls.
6. `scripts/pre-commit-check.sh` ist grün.
7. Alle Checkboxen dieses Plans sind abgehakt und mitcommittet.
