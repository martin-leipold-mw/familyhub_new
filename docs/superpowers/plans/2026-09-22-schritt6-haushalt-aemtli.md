# Schritt 6 — Haushaltsaufgaben (Ämtli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Tick the boxes.** After finishing a step, edit this file and change its `- [ ]` to `- [x]`. Commit the ticked plan together with the code of that task. A task is not done while its boxes are empty.

**Goal:** Wiederkehrende Haushaltsaufgaben als datumslose Warteschlange je Familienmitglied — automatisch reihum verteilt, per Fingertipp abhakbar, unter `/chores` sichtbar und unter `/settings/chores` verwaltbar.

**Architecture:** Eine Vorlage (`chores`) trägt ihren gesamten Terminzustand in einem einzigen Feld `next_due_on`. Ein täglicher Ausgabelauf legt für jede fällige Vorlage ohne offene Zuweisung genau eine `chore_assignments`-Zeile beim nächsten Mitglied der Rotation an; ein partieller Unique-Index garantiert datenbankseitig, dass eine Vorlage nie zweimal gleichzeitig offen ist. Erst die Erledigung setzt `next_due_on = heute + interval_days` und startet damit das Intervall neu. Backend ist package-by-feature (`com.familyhub.chores`), Frontend feature-sliced (`frontend/src/features/chores/`), Vertrag additiv in `api/openapi.yml`.

**Tech Stack:** Kotlin 2.0.21 / Spring Boot 3.3.5 / Java 21 / PostgreSQL + Flyway / JPA · React 18 / TypeScript / Vite / Tailwind / TanStack Query / React Router · OpenAPI 3.1 (kotlin-spring + orval) · JUnit 5 + MockK + Testcontainers · Vitest + Testing Library + Playwright

**Spec:** `docs/superpowers/specs/2026-09-22-schritt6-haushalt-aemtli-design.md` — bei jedem Zweifel gilt der Spec.

## Global Constraints

Diese gelten für **jede** Aufgabe dieses Plans:

- **Backend braucht Java 21.** `JAVA_HOME` muss auf ein JDK 21 zeigen, sonst bricht `./gradlew` mit `IllegalArgumentException: 25.0.3` ab.
- **Backend-Tests brauchen Docker** (Testcontainers startet PostgreSQL 16).
- **Backend-Coverage-Gate:** JaCoCo `LINE ≥ 0.90` und **`BRANCH = 1.00`** (100 %). Ausgenommen: `**/Application*`, `**/generated/**`, `**/config/**`, `**/security/**`, `**/exceptions/ErrorResponse*`. Jeder `if`, jedes `when`, jedes `?:` und jedes `?.` im neuen Code braucht einen Test für **beide** Zweige — oder darf nicht geschrieben werden.
- **Frontend-Coverage-Gate:** `lines: 90`, **`branches: 100`**, `functions: 90`, `statements: 90`. Ausgenommen: `src/api/generated/`, `src/test/`, `src/main.tsx`. Keine defensiven `??` / `?.` ohne erreichbaren Nullfall.
- **Lint:** Backend ktlint + detekt (`maxIssues: 0`). Frontend `eslint . --max-warnings 0` + `tsc --noEmit` + dependency-cruiser.
- **Contract-first:** `api/openapi.yml` ist die einzige Quelle der REST-API. Generierten Code in `backend/build/generated/` und `frontend/src/api/generated/` **niemals** von Hand ändern. Alle Vertragsänderungen dieses Plans sind **additiv** — kein `breaking-change`-Label nötig.
- **Namensgebung (unverhandelbar):** Tabellen `chores` / `chore_assignments`, Paket `com.familyhub.chores`, Routen `/chores` und `/settings/chores`, Frontend-Verzeichnis `frontend/src/features/chores/`. Niemals `household_task*`.
- **UI ist durchgehend deutsch.** Touch-Ziele ≥ 44 × 44 px. Keine `alert()` / `confirm()` / `prompt()`. Styling ausschließlich über die Design-Tokens (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-primary`, `text-muted`, `accent`, `accent-weak`, `danger`, `danger-weak`, `warn`, `border-subtle`).
- **Statuswerte** sind exakt `"open"` und `"completed"`. **Gruppenwerte** exakt `"parents"`, `"children"`, `"all"`. **Rollen** exakt `"parent"`, `"child"`.
- **Obergrenze offener Zuweisungen je Mitglied:** Konfigurationsschlüssel `familyhub.chores.max-open-per-member`, Code-Default **5**.
- **Rücknahmefrist:** 300 Sekunden (5 Minuten).
- **Alle Tagesberechnungen** laufen über die Haushaltszeitzone aus `SettingsService.timezone()` (`family.timezone`, Default `Europe/Berlin`) — niemals über `LocalDate.now()` ohne Zone und niemals über UTC.
- **Commits:** Conventional Commits auf Deutsch/Englisch gemischt wie im Repo (`feat(chores): …`, `test(chores): …`, `docs(chores): …`). Jede Aufgabe endet mit genau einem Commit.
- **Gate vor jedem Commit einer Aufgabe:** mindestens die in der Aufgabe genannten Testkommandos; vor dem letzten Commit einer Phase `cd backend && ./gradlew check` bzw. `cd frontend && npm run check`.

---

## File Structure

**Backend — neu, alle unter `backend/src/main/kotlin/com/familyhub/chores/`:**

| Datei | Verantwortung |
|---|---|
| `Chore.kt` | JPA-Entity der Vorlage |
| `ChoreAssignment.kt` | JPA-Entity der Zuweisung |
| `ChoreRepository.kt` | Spring-Data-Repository der Vorlagen |
| `ChoreAssignmentRepository.kt` | Spring-Data-Repository der Zuweisungen |
| `ChoreClock.kt` | `today()` / `now()` / `startOfToday()` in Haushaltszeitzone — die einzige Stelle, die Zeit liest |
| `ChoreRotation.kt` | reines `object`: Pool nach Gruppe + „wer ist als Nächstes dran" |
| `ChoreRefillService.kt` | der Ausgabelauf (inkl. Freigabe inaktiver Mitglieder), eigene Transaktion je Vorlage |
| `ChoreRefillScheduler.kt` | Cron 05:00 + einmalig nach Start, Reentrancy-Guard |
| `ChoreAssignmentService.kt` | Liste, Abhaken, Rückgängig |
| `ChoreService.kt` | Vorlagen-CRUD inkl. Löschschutz und Sofortausgabe |
| `ChoreController.kt` | `/v1/chores` |
| `ChoreAssignmentController.kt` | `/v1/chore-assignments` |

Neu: `backend/src/main/resources/db/migration/V12__chores.sql`.

**Frontend — neu, alle unter `frontend/src/features/chores/`:**

| Datei | Verantwortung |
|---|---|
| `choreIcons.ts` | Emoji-Palette (Daten, keine Logik) |
| `choreLabels.ts` | Intervall- und Gruppen-Beschriftungen (reine Funktionen) |
| `choreLanes.ts` | Mitglieder + Zuweisungen → sortierte Lanes (reine Funktion) |
| `undoWindow.ts` | `completedAt` + `jetzt` → rücknehmbar? (reine Funktion) + `useNow` |
| `choreOptimistic.ts` | unveränderliches Patchen des Query-Caches (reine Funktion) |
| `choreStatus.ts` | Vorlage + Mitglieder + heute → Zustandstext (reine Funktion, fünf Zustände) |
| `useChores.ts` | generierte Hooks für `/v1/chores` |
| `useChoreAssignments.ts` | generierte Hooks für `/v1/chore-assignments` + optimistisches Abhaken |
| `ChoreCard.tsx` | eine Aufgabenkarte in der Familienansicht |
| `ChoreLane.tsx` | eine Spalte je Mitglied |
| `ChoresView.tsx` | Route `/chores` |
| `ChoreSettingsRow.tsx` | eine Zeile der Verwaltungsliste |
| `ChoreDialog.tsx` | Anlegen und Bearbeiten |
| `ChoreSettingsView.tsx` | Route `/settings/chores` |
| `ChoreSettingsLink.tsx` | die Zeile „Haushalt · {n} Aufgaben →" in `SettingsView` |

Jede `.ts`/`.tsx`-Datei bekommt eine Schwesterdatei `*.test.ts(x)` im selben Verzeichnis.

**Geändert:** `api/openapi.yml`, `frontend/src/App.tsx`, `frontend/src/routing/AppShell.tsx`, `frontend/src/features/settings/SettingsView.tsx`, `backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt`, `CLAUDE.md`. **Neu:** `frontend/e2e/chores.spec.ts`.

**Zwei Ergänzungen gegenüber der Dateiliste des Specs**, beide bewusst:
1. `ChoreClock.kt` — der Spec fordert, dass *alle* Tagesberechnungen über `SettingsService.timezone()` laufen. Eine einzige Klasse dafür ist die einzige Art, das nicht an vier Stellen zu wiederholen.
2. `choreLabels.ts` und `choreOptimistic.ts` — die Intervall-Beschriftungen werden von `ChoreDialog` **und** `ChoreSettingsRow` gebraucht, das Cache-Patchen enthält den einzigen Verzweigungspunkt des optimistischen Abhakens. Beide Verzweigungen gehören laut Spec-Teststrategie in reine Module.

---

# Phase A — Datenmodell

**Phase A endet grün:** `cd backend && ./gradlew check` läuft durch, die Migration greift, der partielle Unique-Index ist gegen die echte Datenbank getestet. Noch keine UI-Wirkung.

### Task 1: Migration, Entities, Repositories

**Files:**
- Create: `backend/src/main/resources/db/migration/V12__chores.sql`
- Create: `backend/src/main/kotlin/com/familyhub/chores/Chore.kt`
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreAssignment.kt`
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreRepository.kt`
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentRepository.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChorePersistenceTest.kt`
- Modify: `backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt:23-30`

**Interfaces:**
- Consumes: `com.familyhub.members.FamilyMember` (Tabelle `family_members`, Spalten `id`, `role`, `is_active`, `created_at`).
- Produces:
  - `class Chore(name: String, icon: String, description: String?, intervalDays: Int, assignmentGroup: String, points: Int, isActive: Boolean, nextDueOn: LocalDate, lastAssignedMemberId: UUID?)` mit `var id: UUID?`, `var createdAt: Instant?`, `var updatedAt: Instant?`
  - `class ChoreAssignment(choreId: UUID, memberId: UUID, status: String, points: Int, assignedOn: LocalDate, completedAt: Instant?)` mit denselben drei Nachfeldern
  - `interface ChoreRepository : JpaRepository<Chore, UUID>` mit `findAllByOrderByCreatedAtAsc()`, `findAllByIsActiveTrueOrderByCreatedAtAsc()`, `findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today: LocalDate)`
  - `interface ChoreAssignmentRepository : JpaRepository<ChoreAssignment, UUID>` mit `findAllByStatus(status)`, `findAllByStatusOrCompletedAtGreaterThanEqual(status, threshold)`, `findByChoreIdAndStatus(choreId, status)`, `existsByChoreIdAndStatus(choreId, status)`, `countByMemberIdAndStatus(memberId, status)`
  - Konstanten `const val STATUS_OPEN = "open"` und `const val STATUS_COMPLETED = "completed"` (in `ChoreAssignment.kt`, top-level im Paket)

---

- [x] **Step 1: Migration schreiben**

`backend/src/main/resources/db/migration/V12__chores.sql`:

```sql
-- V12: Haushaltsaufgaben (Ämtli) — Vorlagen und Zuweisungen.
--
-- Datumsloses Warteschlangen-Modell: eine Vorlage trägt ihren gesamten
-- Terminzustand in next_due_on. Es gibt keine Tagesinstanzen, keine
-- Fälligkeitsuhrzeit und keine Vorausgenerierung.
CREATE TABLE chores (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     VARCHAR(255) NOT NULL,
    icon                     VARCHAR(16)  NOT NULL,
    description              TEXT,
    interval_days            INT          NOT NULL CHECK (interval_days > 0),
    assignment_group         VARCHAR(10)  NOT NULL
                             CHECK (assignment_group IN ('parents', 'children', 'all')),
    points                   INT          NOT NULL DEFAULT 10,
    is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Der gesamte Terminzustand der Vorlage. Bei Anlage = heute.
    next_due_on              DATE         NOT NULL,
    -- Der Rotationszeiger. SET NULL, damit das harte Löschen eines Mitglieds
    -- die Vorlage nicht mitreißt — die Rotation beginnt dann wieder vorne.
    last_assigned_member_id  UUID REFERENCES family_members(id) ON DELETE SET NULL,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE chore_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chore_id      UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    member_id     UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    status        VARCHAR(10) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'completed')),
    -- Eingefrorene Kopie der Vorlagenpunkte: die Gamification in Schritt 7
    -- braucht den Wert, der zum Zeitpunkt der Erledigung galt.
    points        INT  NOT NULL,
    assigned_on   DATE NOT NULL,
    completed_at  TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Der zentrale Constraint: eine Vorlage kann nie zweimal gleichzeitig offen
-- sein. Datenbankseitig, nicht anwendungsseitig — zwei parallele Ausgabeläufe
-- könnten sonst Dubletten erzeugen.
CREATE UNIQUE INDEX ux_chore_assignments_one_open
    ON chore_assignments (chore_id) WHERE status = 'open';

-- Für die Swimlane-Abfrage und das Zählen offener Zuweisungen je Mitglied.
CREATE INDEX idx_chore_assignments_member_status
    ON chore_assignments (member_id, status);
```

- [x] **Step 2: Entities schreiben**

`backend/src/main/kotlin/com/familyhub/chores/Chore.kt`:

```kotlin
package com.familyhub.chores

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

const val GROUP_PARENTS = "parents"
const val GROUP_CHILDREN = "children"
const val GROUP_ALL = "all"

val ASSIGNMENT_GROUPS = setOf(GROUP_PARENTS, GROUP_CHILDREN, GROUP_ALL)

/**
 * Die Ämtli-Vorlage. [nextDueOn] ist ihr vollständiger Terminzustand: Steht es
 * auf heute oder früher und hat die Vorlage keine offene Zuweisung, wird sie im
 * nächsten Ausgabelauf verteilt. Erst die Erledigung schreibt es fort.
 */
@Entity
@Table(name = "chores")
class Chore(
    @Column(nullable = false)
    var name: String,
    @Column(nullable = false)
    var icon: String,
    @Column
    var description: String? = null,
    @Column(name = "interval_days", nullable = false)
    var intervalDays: Int,
    @Column(name = "assignment_group", nullable = false)
    var assignmentGroup: String,
    @Column(nullable = false)
    var points: Int = 10,
    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,
    @Column(name = "next_due_on", nullable = false)
    var nextDueOn: LocalDate,
    @Column(name = "last_assigned_member_id")
    var lastAssignedMemberId: UUID? = null,
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

`backend/src/main/kotlin/com/familyhub/chores/ChoreAssignment.kt`:

```kotlin
package com.familyhub.chores

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

const val STATUS_OPEN = "open"
const val STATUS_COMPLETED = "completed"

/**
 * Eine ausgegebene Aufgabe. Verbucht wird immer auf [memberId] — es gibt kein
 * `completedByMemberId`, also auch keine Möglichkeit, fremde Punkte gutzuschreiben.
 * [points] ist die eingefrorene Kopie aus der Vorlage.
 */
@Entity
@Table(name = "chore_assignments")
class ChoreAssignment(
    @Column(name = "chore_id", nullable = false)
    var choreId: UUID,
    @Column(name = "member_id", nullable = false)
    var memberId: UUID,
    @Column(nullable = false)
    var status: String = STATUS_OPEN,
    @Column(nullable = false)
    var points: Int,
    @Column(name = "assigned_on", nullable = false)
    var assignedOn: LocalDate,
    @Column(name = "completed_at")
    var completedAt: Instant? = null,
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

- [x] **Step 3: Repositories schreiben**

`backend/src/main/kotlin/com/familyhub/chores/ChoreRepository.kt`:

```kotlin
package com.familyhub.chores

import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface ChoreRepository : JpaRepository<Chore, UUID> {
    fun findAllByOrderByCreatedAtAsc(): List<Chore>

    fun findAllByIsActiveTrueOrderByCreatedAtAsc(): List<Chore>

    /**
     * Die Kandidatenliste des Ausgabelaufs. `<= today` statt `= today` ist der
     * gesamte Nachholmechanismus: stand der NAS drei Tage still, kommt beim
     * nächsten Lauf alles Fällige heraus.
     */
    fun findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(
        today: LocalDate,
    ): List<Chore>
}
```

`backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentRepository.kt`:

```kotlin
package com.familyhub.chores

import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface ChoreAssignmentRepository : JpaRepository<ChoreAssignment, UUID> {
    fun findAllByStatus(status: String): List<ChoreAssignment>

    /** Offene plus die heute erledigten — die Antwort wächst nicht mit den Jahren. */
    fun findAllByStatusOrCompletedAtGreaterThanEqual(
        status: String,
        threshold: Instant,
    ): List<ChoreAssignment>

    fun findByChoreIdAndStatus(
        choreId: UUID,
        status: String,
    ): ChoreAssignment?

    fun existsByChoreIdAndStatus(
        choreId: UUID,
        status: String,
    ): Boolean

    fun countByMemberIdAndStatus(
        memberId: UUID,
        status: String,
    ): Long
}
```

- [x] **Step 4: Persistenztest schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChorePersistenceTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.BaseIntegrationTest
import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/**
 * Prüft die Migration gegen die echte Datenbank — insbesondere den partiellen
 * Unique-Index, den kein In-Memory-Ersatz nachbildet.
 */
class ChorePersistenceTest
    @Autowired
    constructor(
        private val chores: ChoreRepository,
        private val assignments: ChoreAssignmentRepository,
        private val members: FamilyMemberRepository,
    ) : BaseIntegrationTest() {
        private lateinit var memberId: UUID
        private lateinit var choreId: UUID

        @BeforeEach
        fun setUp() {
            assignments.deleteAll()
            chores.deleteAll()
            members.deleteAll()
            memberId = members.save(FamilyMember(name = "Anna", role = "child", color = "pink")).id!!
            choreId =
                chores.save(
                    Chore(
                        name = "Toilette putzen",
                        icon = "🚽",
                        intervalDays = 7,
                        assignmentGroup = GROUP_ALL,
                        nextDueOn = LocalDate.of(2026, 9, 22),
                    ),
                ).id!!
        }

        private fun open(on: LocalDate = LocalDate.of(2026, 9, 22)) =
            ChoreAssignment(choreId = choreId, memberId = memberId, points = 10, assignedOn = on)

        @Test
        fun `eine Vorlage kann nur eine offene Zuweisung haben`() {
            assignments.saveAndFlush(open())

            assertThatThrownBy { assignments.saveAndFlush(open()) }
                .hasMessageContaining("ux_chore_assignments_one_open")
        }

        @Test
        fun `eine erledigte Zuweisung blockiert eine neue offene nicht`() {
            val done = assignments.saveAndFlush(open())
            done.status = STATUS_COMPLETED
            done.completedAt = Instant.parse("2026-09-22T10:00:00Z")
            assignments.saveAndFlush(done)

            val second = assignments.saveAndFlush(open(LocalDate.of(2026, 9, 29)))

            assertThat(second.id).isNotNull()
            assertThat(assignments.existsByChoreIdAndStatus(choreId, STATUS_OPEN)).isTrue()
        }

        @Test
        fun `faellige Vorlagen kommen nach nextDueOn sortiert heraus`() {
            chores.save(
                Chore(
                    name = "Müll",
                    icon = "🗑️",
                    intervalDays = 1,
                    assignmentGroup = GROUP_ALL,
                    nextDueOn = LocalDate.of(2026, 9, 20),
                ),
            )
            chores.save(
                Chore(
                    name = "Später",
                    icon = "🪟",
                    intervalDays = 30,
                    assignmentGroup = GROUP_ALL,
                    nextDueOn = LocalDate.of(2026, 9, 30),
                ),
            )

            val due =
                chores.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(
                    LocalDate.of(2026, 9, 22),
                )

            assertThat(due.map { it.name }).containsExactly("Müll", "Toilette putzen")
        }

        @Test
        fun `Loeschen einer Vorlage nimmt ihre Zuweisungen mit`() {
            assignments.saveAndFlush(open())

            chores.deleteById(choreId)
            chores.flush()

            assertThat(assignments.findAllByStatus(STATUS_OPEN)).isEmpty()
        }

        @Test
        fun `zaehlt offene Zuweisungen je Mitglied`() {
            assignments.saveAndFlush(open())

            assertThat(assignments.countByMemberIdAndStatus(memberId, STATUS_OPEN)).isEqualTo(1)
            assertThat(assignments.countByMemberIdAndStatus(memberId, STATUS_COMPLETED)).isZero()
        }
    }
```

- [x] **Step 5: MigrationSmokeTest um V12 erweitern**

In `backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt` die `assertThat(tables).contains(...)`-Liste ergänzen:

```kotlin
            assertThat(tables).contains(
                "google_credentials",
                "google_connections",
                "calendar_subscriptions",
                "events",
                "task_lists",
                "tasks",
                "chores",
                "chore_assignments",
            )
```

- [x] **Step 6: Tests laufen lassen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChorePersistenceTest' --tests 'com.familyhub.google.MigrationSmokeTest'
```
Erwartet: PASS, 6 Tests. Schlägt `eine Vorlage kann nur eine offene Zuweisung haben` mit einer anderen Meldung als `ux_chore_assignments_one_open` fehl, prüfe, ob `saveAndFlush` statt `save` verwendet wird — ohne Flush schlägt der Constraint erst beim Commit zu.

- [x] **Step 7: Volles Backend-Gate**

```bash
cd backend && ./gradlew check
```
Erwartet: BUILD SUCCESSFUL. Entities und Repositories haben keine Verzweigungen, das 100-%-Branch-Limit bleibt also erfüllt.

- [x] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V12__chores.sql \
        backend/src/main/kotlin/com/familyhub/chores/ \
        backend/src/test/kotlin/com/familyhub/chores/ \
        backend/src/test/kotlin/com/familyhub/google/MigrationSmokeTest.kt \
        docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): add V12 schema, entities and repositories"
```

---

# Phase B — Logik und Vertrag

**Phase B endet grün:** `cd backend && ./gradlew check`, alle Endpunkte erreichbar, Ausgabelauf getestet. Noch keine UI.

### Task 2: Zeitbasis und Rotation

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreClock.kt`
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreRotation.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreClockTest.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreRotationTest.kt`

**Interfaces:**
- Consumes: `com.familyhub.settings.SettingsService.timezone(): String`; der `Clock`-Bean aus `com.familyhub.shared.config.ClockConfig`; `com.familyhub.members.FamilyMember` (`id`, `role`).
- Produces:
  - `class ChoreClock(clock: Clock, settingsService: SettingsService)` mit `fun today(): LocalDate`, `fun now(): Instant`, `fun startOfToday(): Instant`
  - `object ChoreRotation` mit
    `fun poolFor(group: String, activeMembers: List<FamilyMember>): List<FamilyMember>` und
    `fun selectNext(pool: List<UUID>, lastAssignedMemberId: UUID?, openCounts: Map<UUID, Int>, maxOpen: Int): UUID?`

---

- [x] **Step 1: Den fehlschlagenden Test für ChoreClock schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreClockTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.settings.SettingsService
import io.mockk.every
import io.mockk.mockk
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

class ChoreClockTest {
    private val settingsService = mockk<SettingsService>()

    // 22:30 UTC am 22.09. ist in Europe/Berlin bereits der 23.09. — genau das
    // Fenster, in dem das Altsystem abends den Folgetag anzeigte.
    private val fixed = Instant.parse("2026-09-22T22:30:00Z")
    private val choreClock = ChoreClock(Clock.fixed(fixed, ZoneOffset.UTC), settingsService)

    @Test
    fun `today rechnet in der Haushaltszeitzone`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        assertThat(choreClock.today()).isEqualTo(LocalDate.of(2026, 9, 23))
    }

    @Test
    fun `today folgt einer abweichenden Zeitzone`() {
        every { settingsService.timezone() } returns "UTC"

        assertThat(choreClock.today()).isEqualTo(LocalDate.of(2026, 9, 22))
    }

    @Test
    fun `now liefert den Zeitpunkt der Uhr`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        assertThat(choreClock.now()).isEqualTo(fixed)
    }

    @Test
    fun `startOfToday ist Mitternacht der Haushaltszeitzone`() {
        every { settingsService.timezone() } returns "Europe/Berlin"

        // 23.09. 00:00 Berlin (UTC+2) = 22.09. 22:00 UTC
        assertThat(choreClock.startOfToday()).isEqualTo(Instant.parse("2026-09-22T22:00:00Z"))
    }
}
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreClockTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreClock`.

- [x] **Step 3: ChoreClock implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreClock.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.settings.SettingsService
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Die einzige Stelle im Ämtli-Modul, die Zeit liest. Alle Tagesberechnungen
 * laufen über die Haushaltszeitzone (`family.timezone`), nicht über UTC und
 * nicht über die Systemzeit des Containers — sonst zeigt die Ansicht abends
 * bereits den Folgetag.
 */
@Component
class ChoreClock(
    private val clock: Clock,
    private val settingsService: SettingsService,
) {
    private fun zone(): ZoneId = ZoneId.of(settingsService.timezone())

    fun today(): LocalDate = LocalDate.now(clock.withZone(zone()))

    fun now(): Instant = clock.instant()

    fun startOfToday(): Instant = today().atStartOfDay(zone()).toInstant()
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreClockTest'
```
Erwartet: PASS, 4 Tests.

- [x] **Step 5: Den fehlschlagenden Test für ChoreRotation schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreRotationTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class ChoreRotationTest {
    private fun member(
        name: String,
        role: String,
    ) = FamilyMember(name = name, role = role, color = "blue").also { it.id = UUID.randomUUID() }

    private val papa = member("Papa", "parent")
    private val mama = member("Mama", "parent")
    private val anna = member("Anna", "child")
    private val ben = member("Ben", "child")

    // Reihenfolge = Anlagedatum; die Repository-Abfrage liefert genau diese.
    private val all = listOf(papa, mama, anna, ben)

    // ─── poolFor ──────────────────────────────────────────────────────────────

    @Test
    fun `parents liefert nur Eltern`() {
        assertThat(ChoreRotation.poolFor(GROUP_PARENTS, all)).containsExactly(papa, mama)
    }

    @Test
    fun `children liefert nur Kinder`() {
        assertThat(ChoreRotation.poolFor(GROUP_CHILDREN, all)).containsExactly(anna, ben)
    }

    @Test
    fun `all liefert alle aktiven Mitglieder in unveraenderter Reihenfolge`() {
        assertThat(ChoreRotation.poolFor(GROUP_ALL, all)).containsExactly(papa, mama, anna, ben)
    }

    // ─── selectNext ───────────────────────────────────────────────────────────

    private fun ids(vararg m: FamilyMember) = m.map { it.id!! }

    @Test
    fun `ohne Zeiger beginnt die Rotation vorne`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama), null, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `der Zeiger rueckt eine Position weiter`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama, anna), papa.id, emptyMap(), 5)

        assertThat(chosen).isEqualTo(mama.id)
    }

    @Test
    fun `hinter dem letzten Mitglied beginnt die Rotation wieder vorne`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama), mama.id, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `ein nicht mehr im Pool stehender Zeiger beginnt wieder vorne`() {
        val gone = UUID.randomUUID()

        val chosen = ChoreRotation.selectNext(ids(papa, mama), gone, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `ein volles Mitglied wird uebersprungen`() {
        val counts = mapOf(mama.id!! to 5)

        val chosen = ChoreRotation.selectNext(ids(papa, mama, anna), papa.id, counts, 5)

        assertThat(chosen).isEqualTo(anna.id)
    }

    @Test
    fun `ein Mitglied knapp unter dem Limit kommt dran`() {
        val counts = mapOf(mama.id!! to 4)

        val chosen = ChoreRotation.selectNext(ids(papa, mama), papa.id, counts, 5)

        assertThat(chosen).isEqualTo(mama.id)
    }

    @Test
    fun `sind alle voll gibt es keine Zuweisung`() {
        val counts = mapOf(papa.id!! to 5, mama.id!! to 5)

        val chosen = ChoreRotation.selectNext(ids(papa, mama), null, counts, 5)

        assertThat(chosen).isNull()
    }

    @Test
    fun `ein leerer Pool gibt keine Zuweisung`() {
        val chosen = ChoreRotation.selectNext(emptyList(), null, emptyMap(), 5)

        assertThat(chosen).isNull()
    }
}
```

- [x] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRotationTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreRotation`.

- [x] **Step 7: ChoreRotation implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreRotation.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMember
import java.util.UUID

/**
 * Reihum-Rotation, ohne Spring und ohne Datenbank — damit sie erschöpfend
 * testbar bleibt. Der Aufrufer liefert den Pool in stabiler Reihenfolge
 * (`findByIsActiveTrueOrderByCreatedAtAsc`) und die Zahl der offenen
 * Zuweisungen je Mitglied.
 */
object ChoreRotation {
    fun poolFor(
        group: String,
        activeMembers: List<FamilyMember>,
    ): List<FamilyMember> =
        when (group) {
            GROUP_PARENTS -> activeMembers.filter { it.role == "parent" }
            GROUP_CHILDREN -> activeMembers.filter { it.role == "child" }
            else -> activeMembers
        }

    /**
     * Liefert das nächste Mitglied der Rotation oder `null`, wenn der Pool leer
     * ist oder alle am Limit stehen. Wer am Limit steht, wird übersprungen —
     * das ist kein entgangener Turnus, sondern der Lastausgleich selbst: der
     * Zeiger rückt nur bei tatsächlicher Ausgabe weiter.
     */
    fun selectNext(
        pool: List<UUID>,
        lastAssignedMemberId: UUID?,
        openCounts: Map<UUID, Int>,
        maxOpen: Int,
    ): UUID? {
        if (pool.isEmpty()) return null
        // indexOfFirst liefert -1, wenn der Zeiger null ist oder das Mitglied
        // nicht mehr im Pool steht — beides landet über (-1 + 1) auf Position 0.
        val start = (pool.indexOfFirst { it == lastAssignedMemberId } + 1) % pool.size
        for (offset in pool.indices) {
            val candidate = pool[(start + offset) % pool.size]
            if ((openCounts[candidate] ?: 0) < maxOpen) return candidate
        }
        return null
    }
}
```

- [x] **Step 8: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRotationTest'
```
Erwartet: PASS, 12 Tests.

- [x] **Step 9: Lint + Commit**

```bash
cd backend && ./gradlew ktlintCheck detekt
cd .. && git add backend/src/main/kotlin/com/familyhub/chores/ backend/src/test/kotlin/com/familyhub/chores/ docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): add household clock and round-robin rotation"
```

---

### Task 3: Ausgabelauf (ChoreRefillService)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreRefillService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreRefillServiceTest.kt`

**Interfaces:**
- Consumes: `ChoreRepository`, `ChoreAssignmentRepository`, `ChoreClock`, `ChoreRotation`, `STATUS_OPEN`, `com.familyhub.members.FamilyMemberRepository.findByIsActiveTrueOrderByCreatedAtAsc()`, `org.springframework.transaction.support.TransactionTemplate` (Spring-Boot-Autokonfiguration).
- Produces:
  - `data class RefillResult(val assigned: Int, val waiting: Int)`
  - `class ChoreRefillService(...)` mit `fun refillAll(): RefillResult` und `fun refillChore(chore: Chore): Boolean`

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreRefillServiceTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.util.UUID

class ChoreRefillServiceTest {
    private val choreRepository = mockk<ChoreRepository>()
    private val assignmentRepository = mockk<ChoreAssignmentRepository>(relaxed = true)
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val choreClock = mockk<ChoreClock>()
    private val transactionTemplate = mockk<TransactionTemplate>()

    private val today = LocalDate.of(2026, 9, 22)

    private fun member(
        name: String,
        role: String,
    ) = FamilyMember(name = name, role = role, color = "blue").also { it.id = UUID.randomUUID() }

    private val papa = member("Papa", "parent")
    private val anna = member("Anna", "child")

    private fun chore(
        name: String,
        group: String = GROUP_ALL,
        due: LocalDate = today,
        last: UUID? = null,
    ) = Chore(
        name = name,
        icon = "🧹",
        intervalDays = 7,
        assignmentGroup = group,
        nextDueOn = due,
        lastAssignedMemberId = last,
    ).also { it.id = UUID.randomUUID() }

    private lateinit var service: ChoreRefillService

    @BeforeEach
    fun setUp() {
        // Die Transaktionsgrenze selbst ist nicht Gegenstand dieses Tests —
        // der Callback wird direkt ausgeführt.
        every { transactionTemplate.execute<Any>(any()) } answers {
            firstArg<TransactionCallback<Any>>().doInTransaction(mockk(relaxed = true))
        }
        every { choreClock.today() } returns today
        every { choreRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns emptyList()
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(papa, anna)
        every { assignmentRepository.countByMemberIdAndStatus(any(), STATUS_OPEN) } returns 0
        service =
            ChoreRefillService(
                choreRepository,
                assignmentRepository,
                memberRepository,
                choreClock,
                transactionTemplate,
                maxOpenPerMember = 5,
            )
    }

    private fun due(vararg chores: Chore) {
        every {
            choreRepository.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
        } returns chores.toList()
        chores.forEach {
            every { assignmentRepository.existsByChoreIdAndStatus(it.id!!, STATUS_OPEN) } returns false
        }
    }

    @Test
    fun `gibt eine faellige Vorlage an das erste Mitglied aus`() {
        val c = chore("Toilette putzen")
        due(c)
        val saved = slot<ChoreAssignment>()
        every { assignmentRepository.save(capture(saved)) } answers { firstArg() }

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 1, waiting = 0))
        assertThat(saved.captured.memberId).isEqualTo(papa.id)
        assertThat(saved.captured.choreId).isEqualTo(c.id)
        assertThat(saved.captured.status).isEqualTo(STATUS_OPEN)
        assertThat(saved.captured.assignedOn).isEqualTo(today)
        assertThat(saved.captured.points).isEqualTo(10)
        assertThat(c.lastAssignedMemberId).isEqualTo(papa.id)
    }

    @Test
    fun `eine nicht faellige Vorlage taucht gar nicht erst auf`() {
        due()

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 0))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `eine Vorlage mit offener Zuweisung wird uebersprungen`() {
        val c = chore("Bad putzen")
        every {
            choreRepository.findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
        } returns listOf(c)
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns true

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 0))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `ein leerer Pool laesst die Vorlage warten`() {
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(papa)
        due(chore("Zimmer aufräumen", group = GROUP_CHILDREN))

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 1))
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `sind alle Poolmitglieder am Limit verfaellt nichts`() {
        every { assignmentRepository.countByMemberIdAndStatus(any(), STATUS_OPEN) } returns 5
        val c = chore("Staubsaugen")
        due(c)

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 0, waiting = 1))
        assertThat(c.lastAssignedMemberId).isNull()
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `holt nach mehrtaegigem Ausfall alles Faellige nach`() {
        val alt = chore("Müll", due = LocalDate.of(2026, 9, 19))
        val neu = chore("Spülmaschine", due = LocalDate.of(2026, 9, 21))
        due(alt, neu)

        val result = service.refillAll()

        assertThat(result).isEqualTo(RefillResult(assigned = 2, waiting = 0))
        // Zwei Vorlagen, zwei verschiedene Mitglieder — der Zeiger rückt weiter.
        assertThat(alt.lastAssignedMemberId).isEqualTo(papa.id)
        assertThat(neu.lastAssignedMemberId).isEqualTo(anna.id)
    }

    @Test
    fun `gibt offene Zuweisungen inaktiver Mitglieder frei`() {
        val weg = UUID.randomUUID()
        val verwaist = ChoreAssignment(choreId = UUID.randomUUID(), memberId = weg, points = 10, assignedOn = today)
        val bleibt = ChoreAssignment(choreId = UUID.randomUUID(), memberId = papa.id!!, points = 10, assignedOn = today)
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns listOf(verwaist, bleibt)
        due()

        service.refillAll()

        verify { assignmentRepository.deleteAll(listOf(verwaist)) }
    }

    @Test
    fun `ohne verwaiste Zuweisungen wird nichts geloescht`() {
        val bleibt = ChoreAssignment(choreId = UUID.randomUUID(), memberId = anna.id!!, points = 10, assignedOn = today)
        every { assignmentRepository.findAllByStatus(STATUS_OPEN) } returns listOf(bleibt)
        due()

        service.refillAll()

        verify(exactly = 0) { assignmentRepository.deleteAll(any<List<ChoreAssignment>>()) }
    }

    @Test
    fun `jede Vorlage laeuft in einer eigenen Transaktion`() {
        due(chore("A"), chore("B"))

        service.refillAll()

        verify(exactly = 2) { transactionTemplate.execute<Any>(any()) }
    }

    @Test
    fun `refillChore gibt eine einzelne Vorlage sofort aus`() {
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        val assigned = service.refillChore(c)

        assertThat(assigned).isTrue()
        assertThat(c.lastAssignedMemberId).isEqualTo(papa.id)
    }

    @Test
    fun `refillChore gibt false zurueck wenn niemand frei ist`() {
        every { memberRepository.findByIsActiveTrueOrderByCreatedAtAsc() } returns emptyList()
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns false

        assertThat(service.refillChore(c)).isFalse()
    }

    @Test
    fun `refillChore gibt false zurueck wenn die Vorlage schon offen ist`() {
        val c = chore("Tisch decken")
        every { assignmentRepository.existsByChoreIdAndStatus(c.id!!, STATUS_OPEN) } returns true

        assertThat(service.refillChore(c)).isFalse()
    }
}
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRefillServiceTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreRefillService`.

- [x] **Step 3: ChoreRefillService implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreRefillService.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMemberRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate

data class RefillResult(
    val assigned: Int,
    val waiting: Int,
)

/**
 * Der Ausgabelauf. Kein Laufprotokoll, kein "letzter erfolgreicher Lauf"-
 * Zeitstempel: die Bedingung lautet `next_due_on <= heute`, also holt jeder
 * Lauf automatisch alles nach, was liegengeblieben ist.
 */
@Service
class ChoreRefillService(
    private val choreRepository: ChoreRepository,
    private val assignmentRepository: ChoreAssignmentRepository,
    private val memberRepository: FamilyMemberRepository,
    private val choreClock: ChoreClock,
    private val transactionTemplate: TransactionTemplate,
    @Value("\${familyhub.chores.max-open-per-member:5}") private val maxOpenPerMember: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun refillAll(): RefillResult {
        val today = choreClock.today()
        releaseOrphanedAssignments()

        val due =
            choreRepository
                .findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
                .filter { !assignmentRepository.existsByChoreIdAndStatus(it.id!!, STATUS_OPEN) }

        var assigned = 0
        var waiting = 0
        for (chore in due) {
            // Eigene Transaktion je Vorlage: ein Fehler in einer einzigen
            // Vorlage darf nicht den kompletten Lauf zurückrollen.
            if (assignInOwnTransaction(chore, today)) assigned++ else waiting++
        }
        log.info("Ämtli-Ausgabe: {} ausgegeben, {} wartend", assigned, waiting)
        return RefillResult(assigned = assigned, waiting = waiting)
    }

    /**
     * Sofortausgabe für genau eine Vorlage — beim Anlegen und beim Reaktivieren.
     * Sonst müsste man bis zum nächsten Morgen warten, um zu sehen, ob die
     * Aufgabe funktioniert.
     */
    fun refillChore(chore: Chore): Boolean = assignInOwnTransaction(chore, choreClock.today())

    private fun assignInOwnTransaction(
        chore: Chore,
        today: LocalDate,
    ): Boolean = transactionTemplate.execute { assignIfPossible(chore, today) } == true

    private fun assignIfPossible(
        chore: Chore,
        today: LocalDate,
    ): Boolean {
        // Erneute Prüfung innerhalb der Transaktion: zwei gleichzeitige Läufe
        // würden sonst am partiellen Unique-Index scheitern statt hier sauber
        // abzubrechen.
        if (assignmentRepository.existsByChoreIdAndStatus(chore.id!!, STATUS_OPEN)) return false

        val pool = ChoreRotation.poolFor(chore.assignmentGroup, memberRepository.findByIsActiveTrueOrderByCreatedAtAsc())
        val openCounts =
            pool.associate { it.id!! to assignmentRepository.countByMemberIdAndStatus(it.id!!, STATUS_OPEN).toInt() }
        val memberId =
            ChoreRotation.selectNext(
                pool = pool.map { it.id!! },
                lastAssignedMemberId = chore.lastAssignedMemberId,
                openCounts = openCounts,
                maxOpen = maxOpenPerMember,
            ) ?: run {
                log.info("Ämtli '{}' wartet — kein freies Mitglied in Gruppe '{}'", chore.name, chore.assignmentGroup)
                return false
            }

        assignmentRepository.save(
            ChoreAssignment(
                choreId = chore.id!!,
                memberId = memberId,
                status = STATUS_OPEN,
                points = chore.points,
                assignedOn = today,
            ),
        )
        chore.lastAssignedMemberId = memberId
        choreRepository.save(chore)
        return true
    }

    /**
     * Schritt 0 des Laufs: offene Zuweisungen deaktivierter Mitglieder geben die
     * Vorlage wieder frei. Das geschieht hier statt in `members`, damit das
     * Mitglieder-Modul nichts über Ämtli wissen muss.
     */
    private fun releaseOrphanedAssignments() {
        val activeIds = memberRepository.findByIsActiveTrueOrderByCreatedAtAsc().mapNotNull { it.id }.toSet()
        val orphaned = assignmentRepository.findAllByStatus(STATUS_OPEN).filter { it.memberId !in activeIds }
        if (orphaned.isNotEmpty()) {
            log.info("Ämtli-Ausgabe: {} Zuweisung(en) inaktiver Mitglieder freigegeben", orphaned.size)
            assignmentRepository.deleteAll(orphaned)
        }
    }
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRefillServiceTest'
```
Erwartet: PASS, 12 Tests.

- [x] **Step 5: Lint + Commit**

```bash
cd backend && ./gradlew ktlintCheck detekt
cd .. && git add backend/src/main/kotlin/com/familyhub/chores/ChoreRefillService.kt \
                backend/src/test/kotlin/com/familyhub/chores/ChoreRefillServiceTest.kt \
                docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): add daily refill run with per-chore transactions"
```

---

### Task 4: Scheduler

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreRefillScheduler.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreRefillSchedulerTest.kt`
- Modify: `backend/src/main/resources/application.yml:21-25` (Block `familyhub:`)

**Interfaces:**
- Consumes: `ChoreRefillService.refillAll(): RefillResult`.
- Produces: `class ChoreRefillScheduler(refillService: ChoreRefillService)` mit `fun runScheduledRefill()`, `fun runStartupRefill()` und `internal val running: AtomicBoolean`.

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreRefillSchedulerTest.kt`:

```kotlin
package com.familyhub.chores

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ChoreRefillSchedulerTest {
    private val refillService = mockk<ChoreRefillService>()
    private val scheduler = ChoreRefillScheduler(refillService)

    @Test
    fun `der geplante Lauf ruft den Ausgabelauf auf`() {
        every { refillService.refillAll() } returns RefillResult(assigned = 2, waiting = 1)

        scheduler.runScheduledRefill()

        verify(exactly = 1) { refillService.refillAll() }
        assertThat(scheduler.running.get()).isFalse()
    }

    @Test
    fun `der Startlauf ruft denselben Ausgabelauf auf`() {
        every { refillService.refillAll() } returns RefillResult(assigned = 0, waiting = 0)

        scheduler.runStartupRefill()

        verify(exactly = 1) { refillService.refillAll() }
    }

    @Test
    fun `ein bereits laufender Lauf wird uebersprungen`() {
        scheduler.running.set(true)

        scheduler.runScheduledRefill()

        verify(exactly = 0) { refillService.refillAll() }
    }

    @Test
    fun `der Guard wird auch nach einem Fehler wieder freigegeben`() {
        every { refillService.refillAll() } throws IllegalStateException("Datenbank weg")

        runCatching { scheduler.runScheduledRefill() }

        assertThat(scheduler.running.get()).isFalse()
    }
}
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRefillSchedulerTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreRefillScheduler`.

- [x] **Step 3: Scheduler implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreRefillScheduler.kt`:

```kotlin
package com.familyhub.chores

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Einmal täglich morgens wird auf bis zu fünf offene Aufgaben je Person
 * aufgefüllt — nicht sofort beim Abhaken. Eine leergeräumte Liste soll bis zum
 * nächsten Morgen leer bleiben: sonst entfällt das Erfolgserlebnis und
 * Fertigwerden fühlt sich an wie Strafe.
 */
@Component
class ChoreRefillScheduler(
    private val refillService: ChoreRefillService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** Internal: package-visible for tests to inspect/set the guard. */
    internal val running = AtomicBoolean(false)

    // Die Zone gehört an den Cron-Ausdruck, weil der Container auf UTC läuft:
    // ohne sie liefe "05:00" im Sommer um 07:00 Ortszeit.
    @Scheduled(
        cron = "\${familyhub.chores.refill-cron:0 0 5 * * *}",
        zone = "\${familyhub.chores.refill-zone:Europe/Berlin}",
    )
    fun runScheduledRefill() = runGuarded("geplant")

    // Einmalig kurz nach dem Start: ein über Nacht gestoppter NAS soll nicht bis
    // zum nächsten Morgen ohne Ämtli dastehen. fixedDelay = Long.MAX_VALUE macht
    // daraus einen einmaligen Lauf.
    @Scheduled(initialDelay = STARTUP_DELAY_MS, fixedDelay = Long.MAX_VALUE)
    fun runStartupRefill() = runGuarded("Start")

    private fun runGuarded(trigger: String) {
        if (!running.compareAndSet(false, true)) {
            log.warn("Ämtli-Ausgabe ({}) übersprungen — vorheriger Lauf noch aktiv", trigger)
            return
        }
        try {
            log.info("Starte Ämtli-Ausgabe ({})", trigger)
            refillService.refillAll()
        } finally {
            running.set(false)
        }
    }

    private companion object {
        const val STARTUP_DELAY_MS = 5_000L
    }
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreRefillSchedulerTest'
```
Erwartet: PASS, 4 Tests.

- [x] **Step 5: Konfiguration dokumentieren**

In `backend/src/main/resources/application.yml` den `familyhub:`-Block ergänzen (die Werte sind identisch mit den Code-Defaults — sie stehen hier, damit die Stellschrauben auffindbar sind):

```yaml
familyhub:
  version: ${APP_VERSION:dev}
  security:
    encryption-key: ${FAMILYHUB_ENCRYPTION_KEY:}
  chores:
    # Täglicher Ausgabelauf der Haushaltsaufgaben.
    refill-cron: ${FAMILYHUB_CHORES_REFILL_CRON:0 0 5 * * *}
    refill-zone: ${FAMILYHUB_CHORES_REFILL_ZONE:Europe/Berlin}
    # Obergrenze OFFENER Zuweisungen je Mitglied; erledigte zählen nicht mit.
    max-open-per-member: ${FAMILYHUB_CHORES_MAX_OPEN:5}
```

- [x] **Step 6: Kontext startet weiterhin**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.google.sync.SchedulingConfigIntegrationTest' --tests 'com.familyhub.shared.health.HealthIntegrationTest'
```
Erwartet: PASS. Schlägt der Start fehl, ist meist der Cron-Ausdruck oder die Zonen-Property falsch geschrieben.

- [x] **Step 7: Lint + Commit**

```bash
cd backend && ./gradlew ktlintCheck detekt
cd .. && git add backend/src/main/kotlin/com/familyhub/chores/ChoreRefillScheduler.kt \
                backend/src/test/kotlin/com/familyhub/chores/ChoreRefillSchedulerTest.kt \
                backend/src/main/resources/application.yml \
                docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): schedule the daily refill run at 05:00 and on startup"
```

---

### Task 5: Abhaken und Rückgängig (ChoreAssignmentService)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreAssignmentServiceTest.kt`

**Interfaces:**
- Consumes: `ChoreAssignmentRepository`, `ChoreRepository`, `ChoreClock`, `STATUS_OPEN`, `STATUS_COMPLETED`, `com.familyhub.shared.exceptions.ResourceNotFoundException`, `com.familyhub.shared.exceptions.ValidationException`.
- Produces:
  - `data class ChoreAssignmentView(val id: UUID, val choreId: UUID, val memberId: UUID, val name: String, val icon: String, val description: String?, val status: String, val points: Int, val assignedOn: LocalDate, val completedAt: Instant?)`
  - `class ChoreAssignmentService(...)` mit `fun listCurrent(): List<ChoreAssignmentView>`, `fun complete(id: UUID): ChoreAssignmentView`, `fun undo(id: UUID): ChoreAssignmentView`
  - `const val UNDO_WINDOW_SECONDS = 300L`

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreAssignmentServiceTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class ChoreAssignmentServiceTest {
    private val assignmentRepository = mockk<ChoreAssignmentRepository>()
    private val choreRepository = mockk<ChoreRepository>()
    private val choreClock = mockk<ChoreClock>()

    private val today = LocalDate.of(2026, 9, 22)
    private val now = Instant.parse("2026-09-22T09:00:00Z")

    private val choreId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()
    private val assignmentId = UUID.randomUUID()

    private lateinit var service: ChoreAssignmentService

    private fun chore() =
        Chore(
            name = "Toilette putzen",
            icon = "🚽",
            description = "Auch den Spiegel!",
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            nextDueOn = today,
        ).also { it.id = choreId }

    private fun assignment(
        status: String = STATUS_OPEN,
        completedAt: Instant? = null,
    ) = ChoreAssignment(
        choreId = choreId,
        memberId = memberId,
        status = status,
        points = 10,
        assignedOn = today,
        completedAt = completedAt,
    ).also { it.id = assignmentId }

    @BeforeEach
    fun setUp() {
        every { choreClock.today() } returns today
        every { choreClock.now() } returns now
        every { choreClock.startOfToday() } returns Instant.parse("2026-09-21T22:00:00Z")
        every { assignmentRepository.save(any()) } answers { firstArg() }
        every { choreRepository.save(any()) } answers { firstArg() }
        service = ChoreAssignmentService(assignmentRepository, choreRepository, choreClock)
    }

    // ─── listCurrent ──────────────────────────────────────────────────────────

    @Test
    fun `listCurrent traegt Name Emoji und Beschreibung der Vorlage auf`() {
        val a = assignment()
        every {
            assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(
                STATUS_OPEN,
                Instant.parse("2026-09-21T22:00:00Z"),
            )
        } returns listOf(a)
        every { choreRepository.findAllById(listOf(choreId)) } returns listOf(chore())

        val views = service.listCurrent()

        assertThat(views).hasSize(1)
        assertThat(views[0].name).isEqualTo("Toilette putzen")
        assertThat(views[0].icon).isEqualTo("🚽")
        assertThat(views[0].description).isEqualTo("Auch den Spiegel!")
        assertThat(views[0].memberId).isEqualTo(memberId)
        assertThat(views[0].points).isEqualTo(10)
    }

    @Test
    fun `listCurrent liefert bei leerem Bestand eine leere Liste`() {
        every { assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(any(), any()) } returns emptyList()
        every { choreRepository.findAllById(emptyList()) } returns emptyList()

        assertThat(service.listCurrent()).isEmpty()
    }

    // ─── complete ─────────────────────────────────────────────────────────────

    @Test
    fun `Erledigen setzt nextDueOn auf heute plus Intervall`() {
        val a = assignment()
        val c = chore()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.complete(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_COMPLETED)
        assertThat(view.completedAt).isEqualTo(now)
        assertThat(c.nextDueOn).isEqualTo(LocalDate.of(2026, 9, 29))
        verify { choreRepository.save(c) }
    }

    @Test
    fun `Erledigen ist idempotent`() {
        val bereits = Instant.parse("2026-09-22T08:00:00Z")
        val a = assignment(status = STATUS_COMPLETED, completedAt = bereits)
        val c = chore()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.complete(assignmentId)

        assertThat(view.completedAt).isEqualTo(bereits)
        assertThat(c.nextDueOn).isEqualTo(today)
        verify(exactly = 0) { choreRepository.save(any()) }
    }

    @Test
    fun `Erledigen einer unbekannten Zuweisung ergibt 404`() {
        every { assignmentRepository.findById(assignmentId) } returns Optional.empty()

        assertThatThrownBy { service.complete(assignmentId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
            .hasMessageContaining("Zuweisung")
    }

    // ─── undo ─────────────────────────────────────────────────────────────────

    @Test
    fun `Ruecknahme innerhalb der Frist oeffnet die Zuweisung wieder`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(120))
        val c = chore().also { it.nextDueOn = LocalDate.of(2026, 9, 29) }
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        val view = service.undo(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_OPEN)
        assertThat(view.completedAt).isNull()
        // nextDueOn bleibt unberührt: der partielle Unique-Index verhindert eine
        // erneute Ausgabe, und die nächste Erledigung überschreibt den Wert ohnehin.
        assertThat(c.nextDueOn).isEqualTo(LocalDate.of(2026, 9, 29))
        verify(exactly = 0) { choreRepository.save(any()) }
    }

    @Test
    fun `Ruecknahme genau an der Fristgrenze ist noch erlaubt`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(UNDO_WINDOW_SECONDS))
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThat(service.undo(assignmentId).status).isEqualTo(STATUS_OPEN)
    }

    @Test
    fun `Ruecknahme nach Ablauf der Frist ergibt 400 mit deutschem Text`() {
        val a = assignment(status = STATUS_COMPLETED, completedAt = now.minusSeconds(301))
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThatThrownBy { service.undo(assignmentId) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Rückgängig ist nur innerhalb von 5 Minuten möglich.")
    }

    @Test
    fun `Ruecknahme einer offenen Zuweisung ist idempotent`() {
        val a = assignment()
        every { assignmentRepository.findById(assignmentId) } returns Optional.of(a)
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        val view = service.undo(assignmentId)

        assertThat(view.status).isEqualTo(STATUS_OPEN)
        verify(exactly = 0) { assignmentRepository.save(any()) }
    }

    @Test
    fun `Ruecknahme einer unbekannten Zuweisung ergibt 404`() {
        every { assignmentRepository.findById(assignmentId) } returns Optional.empty()

        assertThatThrownBy { service.undo(assignmentId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }
}
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreAssignmentServiceTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreAssignmentService`.

- [x] **Step 3: ChoreAssignmentService implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentService.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

const val UNDO_WINDOW_SECONDS = 300L

data class ChoreAssignmentView(
    val id: UUID,
    val choreId: UUID,
    val memberId: UUID,
    val name: String,
    val icon: String,
    val description: String?,
    val status: String,
    val points: Int,
    val assignedOn: LocalDate,
    val completedAt: Instant?,
)

/**
 * Abhaken ist offen und ohne PIN — es ist eine alltägliche Handlung am
 * Wanddisplay. Verbucht wird immer auf `assignment.memberId`; es gibt bewusst
 * keinen Mitglieds-Parameter, also auch keine Möglichkeit, fremde Punkte
 * gutzuschreiben.
 */
@Service
class ChoreAssignmentService(
    private val assignmentRepository: ChoreAssignmentRepository,
    private val choreRepository: ChoreRepository,
    private val choreClock: ChoreClock,
) {
    /** Offene Zuweisungen plus die heute erledigten (Haushaltszeitzone). */
    fun listCurrent(): List<ChoreAssignmentView> {
        val assignments =
            assignmentRepository.findAllByStatusOrCompletedAtGreaterThanEqual(
                STATUS_OPEN,
                choreClock.startOfToday(),
            )
        val chores = choreRepository.findAllById(assignments.map { it.choreId }).associateBy { it.id }
        return assignments.map { it.toView(chores.getValue(it.choreId)) }
    }

    @Transactional
    fun complete(id: UUID): ChoreAssignmentView {
        val assignment = load(id)
        val chore = loadChore(assignment.choreId)
        if (assignment.status == STATUS_COMPLETED) return assignment.toView(chore)

        assignment.status = STATUS_COMPLETED
        assignment.completedAt = choreClock.now()
        assignmentRepository.save(assignment)

        // Erst die Erledigung startet das Intervall neu — nicht die Ausgabe.
        chore.nextDueOn = choreClock.today().plusDays(chore.intervalDays.toLong())
        choreRepository.save(chore)
        return assignment.toView(chore)
    }

    @Transactional
    fun undo(id: UUID): ChoreAssignmentView {
        val assignment = load(id)
        val chore = loadChore(assignment.choreId)
        if (assignment.status != STATUS_COMPLETED) return assignment.toView(chore)

        val deadline = choreClock.now().minusSeconds(UNDO_WINDOW_SECONDS)
        if (assignment.completedAt!!.isBefore(deadline)) {
            throw ValidationException("Rückgängig ist nur innerhalb von 5 Minuten möglich.")
        }
        assignment.status = STATUS_OPEN
        assignment.completedAt = null
        assignmentRepository.save(assignment)
        return assignment.toView(chore)
    }

    private fun load(id: UUID): ChoreAssignment =
        assignmentRepository.findById(id).orElseThrow { ResourceNotFoundException("Zuweisung nicht gefunden") }

    private fun loadChore(id: UUID): Chore =
        choreRepository.findById(id).orElseThrow { ResourceNotFoundException("Haushaltsaufgabe nicht gefunden") }
}

private fun ChoreAssignment.toView(chore: Chore) =
    ChoreAssignmentView(
        id = id!!,
        choreId = choreId,
        memberId = memberId,
        name = chore.name,
        icon = chore.icon,
        description = chore.description,
        status = status,
        points = points,
        assignedOn = assignedOn,
        completedAt = completedAt,
    )
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreAssignmentServiceTest'
```
Erwartet: PASS, 10 Tests.

Hinweis: `assignment.completedAt!!` ist kein Zweig für JaCoCo (Kotlin übersetzt `!!` in einen statischen `Intrinsics`-Aufruf). Der Fall „completed, aber `completedAt` null" ist durch `complete()` ausgeschlossen.

- [x] **Step 5: Lint + Commit**

```bash
cd backend && ./gradlew ktlintCheck detekt
cd .. && git add backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentService.kt \
                backend/src/test/kotlin/com/familyhub/chores/ChoreAssignmentServiceTest.kt \
                docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): complete and undo assignments with a 5-minute window"
```

---

### Task 6: Vorlagen-CRUD (ChoreService)

**Files:**
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreService.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreServiceTest.kt`

**Interfaces:**
- Consumes: `ChoreRepository`, `ChoreAssignmentRepository`, `ChoreClock`, `ChoreRefillService.refillChore(chore)`, `ASSIGNMENT_GROUPS`, `com.familyhub.members.FamilyMemberRepository.findAllById(ids)`.
- Produces:
  - `data class OpenAssignmentView(val id: UUID, val memberId: UUID, val memberName: String, val assignedOn: LocalDate)`
  - `data class ChoreView(val id: UUID, val name: String, val icon: String, val description: String?, val intervalDays: Int, val assignmentGroup: String, val points: Int, val isActive: Boolean, val nextDueOn: LocalDate, val openAssignment: OpenAssignmentView?)`
  - `data class CreateChoreCommand(val name: String, val icon: String, val description: String?, val intervalDays: Int, val assignmentGroup: String, val points: Int)`
  - `data class UpdateChoreCommand(val name: String?, val icon: String?, val description: String?, val intervalDays: Int?, val assignmentGroup: String?, val points: Int?, val isActive: Boolean?, val clearDescription: Boolean)`
  - `class ChoreService(...)` mit `fun list(activeOnly: Boolean): List<ChoreView>`, `fun create(cmd): ChoreView`, `fun update(id, cmd): ChoreView`, `fun delete(id)`

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreServiceTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMember
import com.familyhub.members.FamilyMemberRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

class ChoreServiceTest {
    private val choreRepository = mockk<ChoreRepository>()
    private val assignmentRepository = mockk<ChoreAssignmentRepository>()
    private val memberRepository = mockk<FamilyMemberRepository>()
    private val refillService = mockk<ChoreRefillService>(relaxed = true)
    private val choreClock = mockk<ChoreClock>()

    private val today = LocalDate.of(2026, 9, 22)
    private val choreId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    private lateinit var service: ChoreService

    private fun chore(
        name: String = "Toilette putzen",
        active: Boolean = true,
        due: LocalDate = today,
    ) = Chore(
        name = name,
        icon = "🚽",
        description = "Auch den Spiegel!",
        intervalDays = 7,
        assignmentGroup = GROUP_ALL,
        points = 10,
        isActive = active,
        nextDueOn = due,
    ).also { it.id = choreId }

    private fun validCreate() =
        CreateChoreCommand(
            name = "Toilette putzen",
            icon = "🚽",
            description = null,
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            points = 10,
        )

    private fun emptyUpdate() =
        UpdateChoreCommand(
            name = null,
            icon = null,
            description = null,
            intervalDays = null,
            assignmentGroup = null,
            points = null,
            isActive = null,
            clearDescription = false,
        )

    @BeforeEach
    fun setUp() {
        every { choreClock.today() } returns today
        every { choreRepository.save(any()) } answers { firstArg() }
        every { assignmentRepository.findByChoreIdAndStatus(any(), STATUS_OPEN) } returns null
        every { memberRepository.findAllById(any()) } returns emptyList()
        service = ChoreService(choreRepository, assignmentRepository, memberRepository, refillService, choreClock)
    }

    // ─── list ─────────────────────────────────────────────────────────────────

    @Test
    fun `list liefert alle Vorlagen inklusive pausierter`() {
        every { choreRepository.findAllByOrderByCreatedAtAsc() } returns listOf(chore(active = false))

        val views = service.list(activeOnly = false)

        assertThat(views).hasSize(1)
        assertThat(views[0].isActive).isFalse()
        assertThat(views[0].nextDueOn).isEqualTo(today)
        assertThat(views[0].openAssignment).isNull()
    }

    @Test
    fun `list mit activeOnly liefert nur aktive Vorlagen`() {
        every { choreRepository.findAllByIsActiveTrueOrderByCreatedAtAsc() } returns listOf(chore())

        val views = service.list(activeOnly = true)

        assertThat(views).hasSize(1)
        verify(exactly = 0) { choreRepository.findAllByOrderByCreatedAtAsc() }
    }

    @Test
    fun `list traegt die offene Zuweisung samt Mitgliedsnamen auf`() {
        val assignmentId = UUID.randomUUID()
        every { choreRepository.findAllByOrderByCreatedAtAsc() } returns listOf(chore())
        every { assignmentRepository.findByChoreIdAndStatus(choreId, STATUS_OPEN) } returns
            ChoreAssignment(choreId = choreId, memberId = memberId, points = 10, assignedOn = today)
                .also { it.id = assignmentId }
        every { memberRepository.findAllById(listOf(memberId)) } returns
            listOf(FamilyMember(name = "Anna", role = "child", color = "pink").also { it.id = memberId })

        val open = service.list(activeOnly = false)[0].openAssignment

        assertThat(open).isNotNull
        assertThat(open!!.id).isEqualTo(assignmentId)
        assertThat(open.memberId).isEqualTo(memberId)
        assertThat(open.memberName).isEqualTo("Anna")
        assertThat(open.assignedOn).isEqualTo(today)
    }

    // ─── create ───────────────────────────────────────────────────────────────

    @Test
    fun `create setzt nextDueOn auf heute und gibt sofort aus`() {
        val saved = slotChore()

        val view = service.create(validCreate())

        assertThat(view.nextDueOn).isEqualTo(today)
        assertThat(view.isActive).isTrue()
        verify { refillService.refillChore(saved()) }
    }

    @Test
    fun `create lehnt einen leeren Namen ab`() {
        assertThatThrownBy { service.create(validCreate().copy(name = "   ")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Name darf nicht leer sein")
    }

    @Test
    fun `create lehnt ein leeres Emoji ab`() {
        assertThatThrownBy { service.create(validCreate().copy(icon = "")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Symbol darf nicht leer sein")
    }

    @Test
    fun `create lehnt ein Intervall von null Tagen ab`() {
        assertThatThrownBy { service.create(validCreate().copy(intervalDays = 0)) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Intervall muss mindestens einen Tag betragen")
    }

    @Test
    fun `create lehnt eine unbekannte Zuweisungsgruppe ab`() {
        assertThatThrownBy { service.create(validCreate().copy(assignmentGroup = "grandparents")) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Unbekannte Zuweisungsgruppe")
    }

    @Test
    fun `create lehnt nicht positive Punkte ab`() {
        assertThatThrownBy { service.create(validCreate().copy(points = 0)) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Punkte müssen größer als null sein")
    }

    // ─── update ───────────────────────────────────────────────────────────────

    @Test
    fun `update aendert nur die uebergebenen Felder`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(name = "Bad putzen", points = 20))

        assertThat(c.name).isEqualTo("Bad putzen")
        assertThat(c.points).isEqualTo(20)
        assertThat(c.icon).isEqualTo("🚽")
        assertThat(c.intervalDays).isEqualTo(7)
        assertThat(c.description).isEqualTo("Auch den Spiegel!")
    }

    @Test
    fun `update kann alle uebrigen Felder setzen`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(
            choreId,
            emptyUpdate().copy(icon = "🛁", description = "Neu", intervalDays = 14, assignmentGroup = GROUP_CHILDREN),
        )

        assertThat(c.icon).isEqualTo("🛁")
        assertThat(c.description).isEqualTo("Neu")
        assertThat(c.intervalDays).isEqualTo(14)
        assertThat(c.assignmentGroup).isEqualTo(GROUP_CHILDREN)
    }

    @Test
    fun `update kann die Beschreibung ausdruecklich leeren`() {
        val c = chore()
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(clearDescription = true))

        assertThat(c.description).isNull()
    }

    @Test
    fun `Reaktivieren gibt die Vorlage sofort aus`() {
        val c = chore(active = false)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = true))

        assertThat(c.isActive).isTrue()
        verify { refillService.refillChore(c) }
    }

    @Test
    fun `Pausieren gibt nichts aus`() {
        val c = chore(active = true)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = false))

        assertThat(c.isActive).isFalse()
        verify(exactly = 0) { refillService.refillChore(any()) }
    }

    @Test
    fun `eine bereits aktive Vorlage wird durch isActive true nicht neu ausgegeben`() {
        val c = chore(active = true)
        every { choreRepository.findById(choreId) } returns Optional.of(c)

        service.update(choreId, emptyUpdate().copy(isActive = true))

        verify(exactly = 0) { refillService.refillChore(any()) }
    }

    @Test
    fun `update validiert die neuen Werte`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())

        assertThatThrownBy { service.update(choreId, emptyUpdate().copy(intervalDays = -1)) }
            .isInstanceOf(ValidationException::class.java)
    }

    @Test
    fun `update einer unbekannten Vorlage ergibt 404`() {
        every { choreRepository.findById(choreId) } returns Optional.empty()

        assertThatThrownBy { service.update(choreId, emptyUpdate()) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    // ─── delete ───────────────────────────────────────────────────────────────

    @Test
    fun `delete entfernt eine Vorlage ohne erledigte Historie`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())
        every { assignmentRepository.existsByChoreIdAndStatus(choreId, STATUS_COMPLETED) } returns false
        every { choreRepository.deleteById(choreId) } returns Unit

        service.delete(choreId)

        verify { choreRepository.deleteById(choreId) }
    }

    @Test
    fun `delete lehnt eine Vorlage mit erledigter Historie ab`() {
        every { choreRepository.findById(choreId) } returns Optional.of(chore())
        every { assignmentRepository.existsByChoreIdAndStatus(choreId, STATUS_COMPLETED) } returns true

        assertThatThrownBy { service.delete(choreId) }
            .isInstanceOf(ValidationException::class.java)
            .hasMessage("Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren.")
        verify(exactly = 0) { choreRepository.deleteById(any()) }
    }

    @Test
    fun `delete einer unbekannten Vorlage ergibt 404`() {
        every { choreRepository.findById(choreId) } returns Optional.empty()

        assertThatThrownBy { service.delete(choreId) }
            .isInstanceOf(ResourceNotFoundException::class.java)
    }

    // Hilfsfunktion: fängt die gespeicherte Vorlage ein, damit der Test prüfen
    // kann, dass genau sie an die Sofortausgabe weitergereicht wird.
    private fun slotChore(): () -> Chore {
        var captured: Chore? = null
        every { choreRepository.save(any()) } answers {
            captured = firstArg()
            firstArg()
        }
        return { captured!! }
    }
}
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreServiceTest'
```
Erwartet: Kompilierfehler `Unresolved reference: ChoreService`.

- [x] **Step 3: ChoreService implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreService.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.members.FamilyMemberRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.util.UUID

data class OpenAssignmentView(
    val id: UUID,
    val memberId: UUID,
    val memberName: String,
    val assignedOn: LocalDate,
)

data class ChoreView(
    val id: UUID,
    val name: String,
    val icon: String,
    val description: String?,
    val intervalDays: Int,
    val assignmentGroup: String,
    val points: Int,
    val isActive: Boolean,
    val nextDueOn: LocalDate,
    val openAssignment: OpenAssignmentView?,
)

data class CreateChoreCommand(
    val name: String,
    val icon: String,
    val description: String?,
    val intervalDays: Int,
    val assignmentGroup: String,
    val points: Int,
)

data class UpdateChoreCommand(
    val name: String?,
    val icon: String?,
    val description: String?,
    val intervalDays: Int?,
    val assignmentGroup: String?,
    val points: Int?,
    val isActive: Boolean?,
    val clearDescription: Boolean,
)

@Service
class ChoreService(
    private val choreRepository: ChoreRepository,
    private val assignmentRepository: ChoreAssignmentRepository,
    private val memberRepository: FamilyMemberRepository,
    private val refillService: ChoreRefillService,
    private val choreClock: ChoreClock,
) {
    fun list(activeOnly: Boolean): List<ChoreView> {
        val chores =
            if (activeOnly) {
                choreRepository.findAllByIsActiveTrueOrderByCreatedAtAsc()
            } else {
                choreRepository.findAllByOrderByCreatedAtAsc()
            }
        val open = chores.mapNotNull { assignmentRepository.findByChoreIdAndStatus(it.id!!, STATUS_OPEN) }
        val names = memberRepository.findAllById(open.map { it.memberId }).associate { it.id to it.name }
        val openByChore = open.associateBy { it.choreId }
        return chores.map { chore ->
            chore.toView(
                openByChore[chore.id]?.let {
                    OpenAssignmentView(
                        id = it.id!!,
                        memberId = it.memberId,
                        memberName = names.getValue(it.memberId),
                        assignedOn = it.assignedOn,
                    )
                },
            )
        }
    }

    @Transactional
    fun create(cmd: CreateChoreCommand): ChoreView {
        validate(cmd.name, cmd.icon, cmd.intervalDays, cmd.assignmentGroup, cmd.points)
        val chore =
            choreRepository.save(
                Chore(
                    name = cmd.name.trim(),
                    icon = cmd.icon.trim(),
                    description = cmd.description?.trim()?.ifBlank { null },
                    intervalDays = cmd.intervalDays,
                    assignmentGroup = cmd.assignmentGroup,
                    points = cmd.points,
                    // Bei Anlage sofort fällig — die Vorlage soll unmittelbar in
                    // einer Lane auftauchen, nicht erst am nächsten Morgen.
                    nextDueOn = choreClock.today(),
                ),
            )
        refillService.refillChore(chore)
        return viewOf(chore)
    }

    @Transactional
    fun update(
        id: UUID,
        cmd: UpdateChoreCommand,
    ): ChoreView {
        val chore = load(id)
        val wasActive = chore.isActive
        validate(
            name = cmd.name ?: chore.name,
            icon = cmd.icon ?: chore.icon,
            intervalDays = cmd.intervalDays ?: chore.intervalDays,
            assignmentGroup = cmd.assignmentGroup ?: chore.assignmentGroup,
            points = cmd.points ?: chore.points,
        )
        cmd.name?.let { chore.name = it.trim() }
        cmd.icon?.let { chore.icon = it.trim() }
        cmd.intervalDays?.let { chore.intervalDays = it }
        cmd.assignmentGroup?.let { chore.assignmentGroup = it }
        cmd.points?.let { chore.points = it }
        cmd.isActive?.let { chore.isActive = it }
        // clearDescription gewinnt gegen description: ein PATCH ohne description
        // ist "unverändert", das Leeren muss daher ausdrücklich verlangt werden.
        if (cmd.clearDescription) chore.description = null else cmd.description?.let { chore.description = it.trim() }
        choreRepository.save(chore)

        if (!wasActive && chore.isActive) refillService.refillChore(chore)
        return viewOf(chore)
    }

    @Transactional
    fun delete(id: UUID) {
        load(id)
        // Das Altsystem löschte die Instanzhistorie per CASCADE mit, während die
        // gutgeschriebenen Punkte stehen blieben — Zeitraum-Ranglisten verloren
        // damit ihre Datenbasis. Hier wird stattdessen "Pausieren" angeboten.
        if (assignmentRepository.existsByChoreIdAndStatus(id, STATUS_COMPLETED)) {
            throw ValidationException(
                "Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren.",
            )
        }
        choreRepository.deleteById(id)
    }

    private fun load(id: UUID): Chore =
        choreRepository.findById(id).orElseThrow { ResourceNotFoundException("Haushaltsaufgabe nicht gefunden") }

    private fun viewOf(chore: Chore): ChoreView =
        chore.toView(
            assignmentRepository.findByChoreIdAndStatus(chore.id!!, STATUS_OPEN)?.let {
                OpenAssignmentView(
                    id = it.id!!,
                    memberId = it.memberId,
                    memberName = memberRepository.findById(it.memberId).map { m -> m.name }.orElse(""),
                    assignedOn = it.assignedOn,
                )
            },
        )

    private fun validate(
        name: String,
        icon: String,
        intervalDays: Int,
        assignmentGroup: String,
        points: Int,
    ) {
        if (name.isBlank()) throw ValidationException("Name darf nicht leer sein")
        if (icon.isBlank()) throw ValidationException("Symbol darf nicht leer sein")
        if (intervalDays < 1) throw ValidationException("Intervall muss mindestens einen Tag betragen")
        if (assignmentGroup !in ASSIGNMENT_GROUPS) throw ValidationException("Unbekannte Zuweisungsgruppe")
        if (points < 1) throw ValidationException("Punkte müssen größer als null sein")
    }
}

private fun Chore.toView(open: OpenAssignmentView?) =
    ChoreView(
        id = id!!,
        name = name,
        icon = icon,
        description = description,
        intervalDays = intervalDays,
        assignmentGroup = assignmentGroup,
        points = points,
        isActive = isActive,
        nextDueOn = nextDueOn,
        openAssignment = open,
    )
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreServiceTest'
```
Erwartet: PASS, 18 Tests.

Bleibt ein Zweig unbedeckt, sind es fast immer diese beiden: `description?.trim()?.ifBlank { null }` in `create` (Test mit `description = "  "` ergänzen) und `if (cmd.clearDescription) … else cmd.description?.let …` in `update` (Test mit gesetzter `description` **und** `clearDescription = false`). Ergänze die fehlenden Fälle, statt die Defensive zu entfernen — beide Nullfälle sind über die API erreichbar.

- [x] **Step 5: Lint + Commit**

```bash
cd backend && ./gradlew ktlintCheck detekt
cd .. && git add backend/src/main/kotlin/com/familyhub/chores/ChoreService.kt \
                backend/src/test/kotlin/com/familyhub/chores/ChoreServiceTest.kt \
                docs/superpowers/plans/2026-09-22-schritt6-haushalt-aemtli.md
git commit -m "feat(chores): add chore template CRUD with delete guard and instant refill"
```

---

### Task 7: Vertrag und Controller

**Files:**
- Modify: `api/openapi.yml` — `tags` (nach `Tasks`), `paths` (nach `/v1/tasks/{id}`), `components.schemas` (nach `UpdateTaskRequest`)
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreController.kt`
- Create: `backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentController.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreControllerTest.kt`
- Test: `backend/src/test/kotlin/com/familyhub/chores/ChoreAssignmentControllerTest.kt`

**Interfaces:**
- Consumes: `ChoreService`, `ChoreAssignmentService` und deren Views aus Task 5/6; `com.familyhub.pin.RequiresPinSession`.
- Produces: generierte Interfaces `com.familyhub.generated.api.ChoresApi` und `com.familyhub.generated.api.ChoreAssignmentsApi` sowie die Modelle `ChoreResponse`, `ChoreOpenAssignmentResponse`, `ChoreAssignmentResponse`, `CreateChoreRequest`, `UpdateChoreRequest`, `ClearableChoreField`. Frontend-Hooks: `useListChores`, `useCreateChore`, `useUpdateChore`, `useDeleteChore`, `useListChoreAssignments`, `useCompleteChoreAssignment`, `useUndoChoreAssignment`, `getListChoresQueryKey`, `getListChoreAssignmentsQueryKey`.

---

- [x] **Step 1: Tag ergänzen**

In `api/openapi.yml` unter `tags:` nach dem `Tasks`-Eintrag anfügen:

```yaml
  - name: Chores
    description: Household chores — templates and queued assignments
```

- [x] **Step 2: Pfade ergänzen**

In `api/openapi.yml` nach dem Block `/v1/tasks/{id}:` (also am Ende von `paths:`) anfügen:

```yaml
  /v1/chores:
    get:
      operationId: listChores
      summary: List chore templates with their next due date and open assignment
      tags: [Chores]
      security: []
      parameters:
        - name: activeOnly
          in: query
          required: false
          schema:
            type: boolean
            default: false
      responses:
        "200":
          description: Chore templates
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ChoreResponse"
    post:
      operationId: createChore
      summary: Create a chore template; it is handed out immediately
      tags: [Chores]
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateChoreRequest"
      responses:
        "201":
          description: Chore created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ChoreResponse"

  /v1/chores/{id}:
    patch:
      operationId: updateChore
      summary: Partially update a chore template, including pausing and resuming it
      tags: [Chores]
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
              $ref: "#/components/schemas/UpdateChoreRequest"
      responses:
        "200":
          description: Chore updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ChoreResponse"
    delete:
      operationId: deleteChore
      summary: Delete a chore template; rejected once completed assignments exist
      tags: [Chores]
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
          description: Chore deleted
        "400":
          description: Chore has completed history — pause it instead
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /v1/chore-assignments:
    get:
      operationId: listChoreAssignments
      summary: Open assignments plus those completed today (household timezone)
      tags: [Chores]
      security: []
      responses:
        "200":
          description: Current assignments
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ChoreAssignmentResponse"

  /v1/chore-assignments/{id}/complete:
    post:
      operationId: completeChoreAssignment
      summary: Check an assignment off; always credited to its assigned member
      tags: [Chores]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Assignment completed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ChoreAssignmentResponse"

  /v1/chore-assignments/{id}/undo:
    post:
      operationId: undoChoreAssignment
      summary: Re-open an assignment within five minutes of completing it
      tags: [Chores]
      security: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        "200":
          description: Assignment re-opened
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ChoreAssignmentResponse"
        "400":
          description: The five-minute undo window has passed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

- [x] **Step 3: Schemas ergänzen**

In `api/openapi.yml` unter `components.schemas:` nach `UpdateTaskRequest` anfügen:

```yaml
    ChoreOpenAssignmentResponse:
      type: object
      required: [id, memberId, memberName, assignedOn]
      properties:
        id:
          type: string
          format: uuid
        memberId:
          type: string
          format: uuid
        memberName:
          type: string
        assignedOn:
          type: string
          format: date

    ChoreResponse:
      type: object
      required: [id, name, icon, intervalDays, assignmentGroup, points, isActive, nextDueOn]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        icon:
          type: string
          description: Emoji — the primary reading interface for pre-literate children
        description:
          type: string
          nullable: true
        intervalDays:
          type: integer
          description: Days after a completion before the chore becomes due again
        assignmentGroup:
          type: string
          enum: [parents, children, all]
        points:
          type: integer
        isActive:
          type: boolean
        nextDueOn:
          type: string
          format: date
          description: The chore's entire scheduling state
        openAssignment:
          allOf:
            - $ref: "#/components/schemas/ChoreOpenAssignmentResponse"
          nullable: true
          description: Null when nobody currently holds this chore

    ChoreAssignmentResponse:
      type: object
      required: [id, choreId, memberId, name, icon, status, points, assignedOn]
      properties:
        id:
          type: string
          format: uuid
        choreId:
          type: string
          format: uuid
        memberId:
          type: string
          format: uuid
        name:
          type: string
          description: Carried over from the template, so a rename takes effect at once
        icon:
          type: string
        description:
          type: string
          nullable: true
        status:
          type: string
          enum: [open, completed]
        points:
          type: integer
          description: Frozen copy of the template's points at hand-out time
        assignedOn:
          type: string
          format: date
        completedAt:
          type: string
          nullable: true
          description: ISO-8601 timestamp

    CreateChoreRequest:
      type: object
      required: [name, icon, intervalDays, assignmentGroup]
      properties:
        name:
          type: string
        icon:
          type: string
        description:
          type: string
          nullable: true
        intervalDays:
          type: integer
        assignmentGroup:
          type: string
          enum: [parents, children, all]
        points:
          type: integer
          default: 10

    ClearableChoreField:
      type: string
      description: >-
        A chore field that can be explicitly cleared via `UpdateChoreRequest.clearFields`.
        A nullable property alone cannot express "clear this field" in a PATCH, because
        `null` there already means "leave unchanged" (an absent property is
        indistinguishable from `null` once deserialised).
      enum: [description]

    UpdateChoreRequest:
      type: object
      properties:
        name:
          type: string
        icon:
          type: string
        description:
          type: string
          nullable: true
        intervalDays:
          type: integer
        assignmentGroup:
          type: string
          enum: [parents, children, all]
        points:
          type: integer
        isActive:
          type: boolean
        clearFields:
          type: array
          uniqueItems: true
          description: Fields to explicitly clear; wins over the field's own value in this request.
          items:
            $ref: "#/components/schemas/ClearableChoreField"
```

- [x] **Step 4: Codegen auf beiden Seiten laufen lassen und die erzeugten Typen prüfen**

```bash
cd backend && ./gradlew openApiGenerate
ls build/generated/src/main/kotlin/com/familyhub/generated/api/ | grep -i chore
grep "openAssignment" build/generated/src/main/kotlin/com/familyhub/generated/model/ChoreResponse.kt
cd ../frontend && npm run generate:api
grep "openAssignment" src/api/generated/model/choreResponse.ts
```

Erwartet: `ChoresApi.kt` und `ChoreAssignmentsApi.kt` existieren; `ChoreResponse.openAssignment` hat in Kotlin den Typ `ChoreOpenAssignmentResponse?` und in TypeScript `ChoreOpenAssignmentResponse` als optionale Eigenschaft.

**Falls der Generator aus `allOf` + `nullable: true` etwas anderes macht** (z. B. eine `Any`-Eigenschaft oder eine leere Inline-Klasse): ersetze in `ChoreResponse` den `openAssignment`-Block durch die entfaltete Form und passe die Controller-Zuordnung in Step 6 entsprechend an — die vier Felder sind dieselben:

```yaml
        openAssignment:
          type: object
          nullable: true
          required: [id, memberId, memberName, assignedOn]
          properties:
            id: { type: string, format: uuid }
            memberId: { type: string, format: uuid }
            memberName: { type: string }
            assignedOn: { type: string, format: date }
```

Dann heißt der generierte Typ `ChoreResponseOpenAssignment` statt `ChoreOpenAssignmentResponse`; das eigenständige Schema `ChoreOpenAssignmentResponse` wird in diesem Fall aus `components.schemas` wieder entfernt, da es dann niemand referenziert.

- [x] **Step 5: Den fehlschlagenden Controller-Test für Vorlagen schreiben**

Vorher nachschlagen: den Namen des PIN-Headers und die Signatur von `PinSessionService.isValid` in `backend/src/main/kotlin/com/familyhub/pin/PinSessionInterceptor.kt` — der Test unten setzt beides voraus und ist die einzige Stelle des Plans, die das tut. Weicht etwas ab, hier angleichen.

`backend/src/test/kotlin/com/familyhub/chores/ChoreControllerTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.pin.PinSessionService
import com.familyhub.settings.Setting
import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.ValidationException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.justRun
import io.mockk.slot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.time.LocalDate
import java.util.Optional
import java.util.UUID

@WebMvcTest(controllers = [ChoreController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class ChoreControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: ChoreService

    // Vorhanden, damit InterceptorConfig den PinSessionInterceptor auch in
    // diesem Slice registriert (siehe dessen Doku-Kommentar).
    @MockkBean
    lateinit var pinSessionService: PinSessionService

    @MockkBean
    lateinit var settingRepository: SettingRepository

    private val choreId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000c1")
    private val memberId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")
    private val token: String = UUID.randomUUID().toString()

    private fun view(open: OpenAssignmentView? = null) =
        ChoreView(
            id = choreId,
            name = "Toilette putzen",
            icon = "🚽",
            description = "Auch den Spiegel!",
            intervalDays = 7,
            assignmentGroup = GROUP_ALL,
            points = 10,
            isActive = true,
            nextDueOn = LocalDate.of(2026, 9, 29),
            openAssignment = open,
        )

    private fun setupCompleted() {
        every { settingRepository.findById("setup.completed") } returns
            Optional.of(Setting(key = "setup.completed", value = "true"))
    }

    private fun validSession() {
        setupCompleted()
        every { pinSessionService.isValid(UUID.fromString(token)) } returns true
    }

    // ─── Lesen ist offen ──────────────────────────────────────────────────────

    @Test
    fun `GET chores liefert die Vorlagen`() {
        every { service.list(false) } returns listOf(view())

        mockMvc.get("/api/v1/chores").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Toilette putzen") }
            jsonPath("$[0].icon") { value("🚽") }
            jsonPath("$[0].intervalDays") { value(7) }
            jsonPath("$[0].assignmentGroup") { value("all") }
            jsonPath("$[0].nextDueOn") { value("2026-09-29") }
            jsonPath("$[0].openAssignment") { doesNotExist() }
        }
    }

    @Test
    fun `GET chores mit activeOnly reicht den Filter durch`() {
        every { service.list(true) } returns emptyList()

        mockMvc.get("/api/v1/chores?activeOnly=true").andExpect {
            status { isOk() }
            jsonPath("$") { isEmpty() }
        }
    }

    @Test
    fun `GET chores traegt die offene Zuweisung auf`() {
        every { service.list(false) } returns
            listOf(
                view(
                    OpenAssignmentView(
                        id = UUID.randomUUID(),
                        memberId = memberId,
                        memberName = "Anna",
                        assignedOn = LocalDate.of(2026, 9, 22),
                    ),
                ),
            )

        mockMvc.get("/api/v1/chores").andExpect {
            status { isOk() }
            jsonPath("$[0].openAssignment.memberName") { value("Anna") }
            jsonPath("$[0].openAssignment.assignedOn") { value("2026-09-22") }
        }
    }

    // ─── Schreiben ist PIN-geschützt ──────────────────────────────────────────

    @Test
    fun `POST chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.post("/api/v1/chores") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Müll","icon":"🗑️","intervalDays":1,"assignmentGroup":"all"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `PATCH chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.patch("/api/v1/chores/$choreId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"isActive":false}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `DELETE chores ohne PIN-Sitzung ergibt 401`() {
        setupCompleted()

        mockMvc.delete("/api/v1/chores/$choreId").andExpect { status { isUnauthorized() } }
    }

    // ─── Schreibende Endpunkte mit gültiger Sitzung ───────────────────────────

    @Test
    fun `POST chores legt eine Vorlage an`() {
        validSession()
        val cmd = slot<CreateChoreCommand>()
        every { service.create(capture(cmd)) } returns view()

        mockMvc.post("/api/v1/chores") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content =
                """{"name":"Toilette putzen","icon":"🚽","description":"Auch den Spiegel!",""" +
                    """"intervalDays":7,"assignmentGroup":"all","points":10}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.name") { value("Toilette putzen") }
        }

        assertThat(cmd.captured.assignmentGroup).isEqualTo(GROUP_ALL)
        assertThat(cmd.captured.points).isEqualTo(10)
    }

    @Test
    fun `POST chores ohne points faellt auf zehn zurueck`() {
        validSession()
        val cmd = slot<CreateChoreCommand>()
        every { service.create(capture(cmd)) } returns view()

        mockMvc.post("/api/v1/chores") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Müll","icon":"🗑️","intervalDays":1,"assignmentGroup":"children"}"""
        }.andExpect { status { isCreated() } }

        assertThat(cmd.captured.points).isEqualTo(10)
    }

    @Test
    fun `PATCH chores reicht clearFields durch`() {
        validSession()
        val cmd = slot<UpdateChoreCommand>()
        every { service.update(choreId, capture(cmd)) } returns view()

        mockMvc.patch("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Bad putzen","clearFields":["description"]}"""
        }.andExpect { status { isOk() } }

        assertThat(cmd.captured.clearDescription).isTrue()
        assertThat(cmd.captured.name).isEqualTo("Bad putzen")
    }

    @Test
    fun `PATCH chores ohne clearFields loescht nichts`() {
        validSession()
        val cmd = slot<UpdateChoreCommand>()
        every { service.update(choreId, capture(cmd)) } returns view()

        mockMvc.patch("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
            contentType = MediaType.APPLICATION_JSON
            content = """{"isActive":false}"""
        }.andExpect { status { isOk() } }

        assertThat(cmd.captured.clearDescription).isFalse()
        assertThat(cmd.captured.isActive).isFalse()
    }

    @Test
    fun `DELETE chores loescht die Vorlage`() {
        validSession()
        justRun { service.delete(choreId) }

        mockMvc.delete("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
        }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `DELETE chores mit Historie ergibt 400 mit deutschem Text`() {
        validSession()
        val text = "Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren."
        every { service.delete(choreId) } throws ValidationException(text)

        mockMvc.delete("/api/v1/chores/$choreId") {
            headers { set("X-Pin-Session", token) }
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("VALIDATION_ERROR") }
            jsonPath("$.message") { value(text) }
        }
    }
}
```

- [x] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreControllerTest'
```

Erwartet: Kompilierfehler `Unresolved reference: ChoreController`.

- [x] **Step 7: ChoreController implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreController.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.generated.api.ChoresApi
import com.familyhub.generated.model.ChoreOpenAssignmentResponse
import com.familyhub.generated.model.ChoreResponse
import com.familyhub.generated.model.ClearableChoreField
import com.familyhub.generated.model.CreateChoreRequest
import com.familyhub.generated.model.UpdateChoreRequest
import com.familyhub.pin.RequiresPinSession
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Konfigurierend = PIN-geschützt, alltäglich = offen — dieselbe Linie wie bei
 * Kalender und Aufgaben. Lesen bleibt frei, jeder schreibende Zugriff braucht
 * eine gültige PIN-Sitzung.
 */
@RestController
@RequestMapping("/api")
class ChoreController(
    private val service: ChoreService,
) : ChoresApi {
    override fun listChores(activeOnly: Boolean?): ResponseEntity<List<ChoreResponse>> =
        ResponseEntity.ok(service.list(activeOnly == true).map { it.toResponse() })

    @RequiresPinSession
    override fun createChore(createChoreRequest: CreateChoreRequest): ResponseEntity<ChoreResponse> {
        val view =
            service.create(
                CreateChoreCommand(
                    name = createChoreRequest.name,
                    icon = createChoreRequest.icon,
                    description = createChoreRequest.description,
                    intervalDays = createChoreRequest.intervalDays,
                    assignmentGroup = createChoreRequest.assignmentGroup.value,
                    points = createChoreRequest.points ?: DEFAULT_POINTS,
                ),
            )
        return ResponseEntity.status(HttpStatus.CREATED).body(view.toResponse())
    }

    @RequiresPinSession
    override fun updateChore(
        id: UUID,
        updateChoreRequest: UpdateChoreRequest,
    ): ResponseEntity<ChoreResponse> {
        val clearFields = updateChoreRequest.clearFields ?: emptyList()
        val view =
            service.update(
                id,
                UpdateChoreCommand(
                    name = updateChoreRequest.name,
                    icon = updateChoreRequest.icon,
                    description = updateChoreRequest.description,
                    intervalDays = updateChoreRequest.intervalDays,
                    assignmentGroup = updateChoreRequest.assignmentGroup?.value,
                    points = updateChoreRequest.points,
                    isActive = updateChoreRequest.isActive,
                    clearDescription = clearFields.contains(ClearableChoreField.DESCRIPTION),
                ),
            )
        return ResponseEntity.ok(view.toResponse())
    }

    @RequiresPinSession
    override fun deleteChore(id: UUID): ResponseEntity<Unit> {
        service.delete(id)
        return ResponseEntity.noContent().build()
    }

    private companion object {
        const val DEFAULT_POINTS = 10
    }
}

private fun ChoreView.toResponse() =
    ChoreResponse(
        id = id,
        name = name,
        icon = icon,
        description = description,
        intervalDays = intervalDays,
        assignmentGroup = ChoreResponse.AssignmentGroup.forValue(assignmentGroup),
        points = points,
        isActive = isActive,
        nextDueOn = nextDueOn,
        openAssignment =
            openAssignment?.let {
                ChoreOpenAssignmentResponse(
                    id = it.id,
                    memberId = it.memberId,
                    memberName = it.memberName,
                    assignedOn = it.assignedOn,
                )
            },
    )
```

Die exakten Namen der generierten Enum-Zugriffe (`ChoreResponse.AssignmentGroup.forValue(...)`, `ClearableChoreField.DESCRIPTION`) aus dem in Step 4 erzeugten Code übernehmen — `TaskController.kt` zeigt dasselbe Muster für `TaskResponse.Status`.

- [x] **Step 8: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreControllerTest'
```

Erwartet: PASS, 11 Tests.

- [x] **Step 9: Den fehlschlagenden Controller-Test für Zuweisungen schreiben**

`backend/src/test/kotlin/com/familyhub/chores/ChoreAssignmentControllerTest.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.pin.PinSessionService
import com.familyhub.settings.SettingRepository
import com.familyhub.shared.exceptions.GlobalExceptionHandler
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import com.familyhub.shared.security.SecurityConfig
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.junit5.MockKExtension
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@WebMvcTest(controllers = [ChoreAssignmentController::class])
@Import(SecurityConfig::class, GlobalExceptionHandler::class)
@ExtendWith(MockKExtension::class)
class ChoreAssignmentControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockkBean
    lateinit var service: ChoreAssignmentService

    @MockkBean
    lateinit var pinSessionService: PinSessionService

    @MockkBean
    lateinit var settingRepository: SettingRepository

    private val assignmentId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")

    private fun view(
        status: String = STATUS_OPEN,
        completedAt: Instant? = null,
    ) = ChoreAssignmentView(
        id = assignmentId,
        choreId = UUID.randomUUID(),
        memberId = UUID.randomUUID(),
        name = "Toilette putzen",
        icon = "🚽",
        description = "Auch den Spiegel!",
        status = status,
        points = 10,
        assignedOn = LocalDate.of(2026, 9, 22),
        completedAt = completedAt,
    )

    @Test
    fun `GET chore-assignments liefert die aktuellen Zuweisungen`() {
        every { service.listCurrent() } returns listOf(view())

        mockMvc.get("/api/v1/chore-assignments").andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("Toilette putzen") }
            jsonPath("$[0].icon") { value("🚽") }
            jsonPath("$[0].status") { value("open") }
            jsonPath("$[0].points") { value(10) }
            jsonPath("$[0].assignedOn") { value("2026-09-22") }
        }
    }

    @Test
    fun `POST complete hakt ohne PIN-Sitzung ab`() {
        val done = Instant.parse("2026-09-22T09:00:00Z")
        every { service.complete(assignmentId) } returns view(status = STATUS_COMPLETED, completedAt = done)

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/complete").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("completed") }
            jsonPath("$.completedAt") { value(done.toString()) }
        }
    }

    @Test
    fun `POST complete auf eine unbekannte Zuweisung ergibt 404`() {
        every { service.complete(assignmentId) } throws ResourceNotFoundException("Zuweisung nicht gefunden")

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/complete").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("NOT_FOUND") }
        }
    }

    @Test
    fun `POST undo oeffnet die Zuweisung wieder`() {
        every { service.undo(assignmentId) } returns view()

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/undo").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("open") }
            jsonPath("$.completedAt") { doesNotExist() }
        }
    }

    @Test
    fun `POST undo nach Fristablauf ergibt 400 mit deutschem Text`() {
        every { service.undo(assignmentId) } throws
            ValidationException("Rückgängig ist nur innerhalb von 5 Minuten möglich.")

        mockMvc.post("/api/v1/chore-assignments/$assignmentId/undo").andExpect {
            status { isBadRequest() }
            jsonPath("$.message") { value("Rückgängig ist nur innerhalb von 5 Minuten möglich.") }
        }
    }
}
```

- [x] **Step 10: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreAssignmentControllerTest'
```

Erwartet: Kompilierfehler `Unresolved reference: ChoreAssignmentController`.

- [x] **Step 11: ChoreAssignmentController implementieren**

`backend/src/main/kotlin/com/familyhub/chores/ChoreAssignmentController.kt`:

```kotlin
package com.familyhub.chores

import com.familyhub.generated.api.ChoreAssignmentsApi
import com.familyhub.generated.model.ChoreAssignmentResponse
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

/**
 * Bewusst ohne PIN-Schutz: Abhaken ist die alltägliche Handlung am Wanddisplay,
 * und die Aktion trägt keinen Mitglieds-Parameter, über den sich fremde Punkte
 * gutschreiben ließen.
 */
@RestController
@RequestMapping("/api")
class ChoreAssignmentController(
    private val service: ChoreAssignmentService,
) : ChoreAssignmentsApi {
    override fun listChoreAssignments(): ResponseEntity<List<ChoreAssignmentResponse>> =
        ResponseEntity.ok(service.listCurrent().map { it.toResponse() })

    override fun completeChoreAssignment(id: UUID): ResponseEntity<ChoreAssignmentResponse> =
        ResponseEntity.ok(service.complete(id).toResponse())

    override fun undoChoreAssignment(id: UUID): ResponseEntity<ChoreAssignmentResponse> =
        ResponseEntity.ok(service.undo(id).toResponse())
}

private fun ChoreAssignmentView.toResponse() =
    ChoreAssignmentResponse(
        id = id,
        choreId = choreId,
        memberId = memberId,
        name = name,
        icon = icon,
        description = description,
        status = ChoreAssignmentResponse.Status.forValue(status),
        points = points,
        assignedOn = assignedOn,
        completedAt = completedAt?.toString(),
    )
```

- [x] **Step 12: Test laufen lassen, grün bestätigen**

```bash
cd backend && ./gradlew test --tests 'com.familyhub.chores.ChoreAssignmentControllerTest'
```

Erwartet: PASS, 5 Tests.

- [x] **Step 13: Volles Backend-Gate inklusive ArchUnit und Coverage**

```bash
cd backend && ./gradlew check
```

Erwartet: BUILD SUCCESSFUL. Schlägt `LayeredArchitectureTest` an, liegt eine Schichtverletzung im neuen Code vor (meist: ein Controller greift direkt auf ein Repository zu) — beheben, nicht die Regel lockern. Schlägt `jacocoTestCoverageVerification` auf BRANCH an, öffne `backend/build/reports/jacoco/test/html/index.html` und suche die rot markierte Verzweigung.

- [x] **Step 14: Vertragsprüfung wie in CI**

```bash
cd .. && npx --yes @redocly/cli@latest lint api/openapi.yml
```

Erwartet: keine Fehler. Die CI führt zusätzlich `oasdiff` gegen `main` aus; alle Änderungen dieses Tasks sind additiv, dort ist also „no breaking changes" zu erwarten.

- [x] **Step 15: Commit**

Die geänderte `api/openapi.yml`, beide Controller, beide Controller-Tests und diesen Plan committen:

```
feat(chores): add REST contract and controllers for chores and assignments
```

---

# Phase C — Familienansicht

**Phase C endet grün:** `cd frontend && npm run check`, `/chores` ist über die Bereichsnavigation erreichbar.

### Task 8: Reine Module der Ämtli-Ansicht

**Files:**
- Create: `frontend/src/features/chores/choreIcons.ts`
- Create: `frontend/src/features/chores/choreLabels.ts` + `choreLabels.test.ts`
- Create: `frontend/src/features/chores/choreLanes.ts` + `choreLanes.test.ts`
- Create: `frontend/src/features/chores/undoWindow.ts` + `undoWindow.test.ts`
- Create: `frontend/src/features/chores/choreOptimistic.ts` + `choreOptimistic.test.ts`

**Interfaces:**
- Consumes: generierte Typen `ChoreAssignmentResponse`, `MemberResponse` aus `@/api/generated/model` (nach Task 7 vorhanden).
- Produces:
  - `CHORE_ICONS: string[]`, `DEFAULT_CHORE_ICON: string`
  - `type ChoreGroup = 'parents' | 'children' | 'all'`, `INTERVAL_OPTIONS: { days: number; label: string }[]`, `intervalLabel(days: number): string`, `GROUP_OPTIONS: { value: ChoreGroup; label: string }[]`, `GROUP_LABELS: Record<ChoreGroup, string>`
  - `type ChoreLaneModel = { member: MemberResponse; open: ChoreAssignmentResponse[]; completed: ChoreAssignmentResponse[] }`, `buildChoreLanes(members, assignments): ChoreLaneModel[]`
  - `UNDO_WINDOW_MS: number`, `canUndo(completedAt: string | null | undefined, now: Date): boolean`
  - `type AssignmentsCache = { data: ChoreAssignmentResponse[] } | undefined`, `patchAssignment(cache, id, patch): AssignmentsCache`

**Hinweis zur Coverage:** Diese fünf Dateien tragen bewusst *alle* Verzweigungen der Familienansicht. Die Komponenten in Task 10/11 bleiben dadurch dünn genug, um die 100-%-Branch-Schwelle zu halten.

---

- [x] **Step 1: Verzeichnis anlegen und die Emoji-Palette schreiben**

`frontend/src/features/chores/choreIcons.ts`:

```ts
/**
 * Die Palette des Vorlagen-Dialogs. Das Emoji ist kein Beiwerk, sondern das
 * Leseinterface: die jüngste Nutzerin ist fünf und kann noch nicht lesen.
 * Deshalb eine feste, haushaltstypische Auswahl statt freier Eingabe.
 */
export const CHORE_ICONS = [
  '🧹', '🧽', '🧼', '🚽', '🛁', '🚿', '🪣', '🧴',
  '🧺', '👕', '🧦', '🍽️', '🥄', '🍳', '🗑️', '♻️',
  '🛏️', '🪟', '🪑', '🧸', '📚', '✏️', '🐕', '🐈',
  '🐟', '🌱', '🪴', '🌻', '🚗', '🧊', '🥛', '📦',
]

export const DEFAULT_CHORE_ICON = '🧹'
```

Diese Datei enthält keine Logik und braucht daher keinen eigenen Test; sie wird über `ChoreDialog` (Task 13) mit abgedeckt.

- [x] **Step 2: Den fehlschlagenden Test für choreLabels schreiben**

`frontend/src/features/chores/choreLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { INTERVAL_OPTIONS, intervalLabel, GROUP_OPTIONS, GROUP_LABELS } from './choreLabels'

describe('intervalLabel', () => {
  it('benennt jedes Intervall der Palette', () => {
    expect(intervalLabel(1)).toBe('Täglich')
    expect(intervalLabel(2)).toBe('Alle 2 Tage')
    expect(intervalLabel(7)).toBe('Wöchentlich')
    expect(intervalLabel(14)).toBe('Alle 2 Wochen')
    expect(intervalLabel(30)).toBe('Monatlich')
    expect(intervalLabel(90)).toBe('Vierteljährlich')
  })

  it('faellt fuer ein Intervall ausserhalb der Palette auf Tage zurueck', () => {
    // Über die API ist jedes intervalDays > 0 möglich, nicht nur die sechs Kacheln.
    expect(intervalLabel(3)).toBe('Alle 3 Tage')
  })
})

describe('GROUP_LABELS', () => {
  it('benennt alle drei Zuweisungsgruppen deutsch', () => {
    expect(GROUP_LABELS.parents).toBe('Eltern')
    expect(GROUP_LABELS.children).toBe('Kinder')
    expect(GROUP_LABELS.all).toBe('Alle')
  })
})

describe('Paletten', () => {
  it('bieten sechs Intervalle und drei Gruppen an', () => {
    expect(INTERVAL_OPTIONS).toHaveLength(6)
    expect(GROUP_OPTIONS.map((g) => g.value)).toEqual(['parents', 'children', 'all'])
  })
})
```

- [x] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreLabels.test.ts
```

Erwartet: `Failed to resolve import "./choreLabels"`.

- [x] **Step 4: choreLabels implementieren**

`frontend/src/features/chores/choreLabels.ts`:

```ts
export type ChoreGroup = 'parents' | 'children' | 'all'

export const INTERVAL_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: 'Täglich' },
  { days: 2, label: 'Alle 2 Tage' },
  { days: 7, label: 'Wöchentlich' },
  { days: 14, label: 'Alle 2 Wochen' },
  { days: 30, label: 'Monatlich' },
  { days: 90, label: 'Vierteljährlich' },
]

/**
 * "Täglich" ist bewusst dabei: im Warteschlangen-Modell kann sich nichts
 * stauen — eine tägliche Aufgabe erscheint frühestens am Tag nach ihrer
 * Erledigung wieder, und die Obergrenze deckelt die Liste ohnehin.
 */
export function intervalLabel(days: number): string {
  const match = INTERVAL_OPTIONS.find((o) => o.days === days)
  return match ? match.label : `Alle ${days} Tage`
}

// Record statt Lookup-Funktion: der Schlüsseltyp deckt genau die drei Werte des
// Vertrags ab, es gibt also keinen Fehlschlag-Zweig, der getestet werden müsste.
export const GROUP_LABELS: Record<ChoreGroup, string> = {
  parents: 'Eltern',
  children: 'Kinder',
  all: 'Alle',
}

export const GROUP_OPTIONS: { value: ChoreGroup; label: string }[] = [
  { value: 'parents', label: GROUP_LABELS.parents },
  { value: 'children', label: GROUP_LABELS.children },
  { value: 'all', label: GROUP_LABELS.all },
]
```

- [x] **Step 5: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreLabels.test.ts
```

Erwartet: PASS, 4 Tests.

- [x] **Step 6: Den fehlschlagenden Test für choreLanes schreiben**

`frontend/src/features/chores/choreLanes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'
import { buildChoreLanes } from './choreLanes'

function member(id: string, name: string, isActive = true): MemberResponse {
  return { id, name, role: 'child', color: 'pink', isActive, createdAt: '', updatedAt: '' }
}

function assignment(
  id: string,
  memberId: string,
  overrides: Partial<ChoreAssignmentResponse> = {},
): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId,
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

describe('buildChoreLanes', () => {
  it('legt fuer jedes aktive Mitglied eine Lane an, auch ohne Aufgaben', () => {
    const lanes = buildChoreLanes([member('m1', 'Anna'), member('m2', 'Ben')], [])

    expect(lanes.map((l) => l.member.id)).toEqual(['m1', 'm2'])
    expect(lanes[0].open).toEqual([])
    expect(lanes[0].completed).toEqual([])
  })

  it('laesst inaktive Mitglieder weg', () => {
    const lanes = buildChoreLanes([member('m1', 'Anna'), member('m2', 'Ben', false)], [])

    expect(lanes.map((l) => l.member.id)).toEqual(['m1'])
  })

  it('ordnet jede Zuweisung ihrem Mitglied zu', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna'), member('m2', 'Ben')],
      [assignment('a1', 'm1'), assignment('a2', 'm2')],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['a1'])
    expect(lanes[1].open.map((a) => a.id)).toEqual(['a2'])
  })

  it('trennt offene von erledigten Aufgaben', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('a1', 'm1'),
        assignment('a2', 'm1', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['a1'])
    expect(lanes[0].completed.map((a) => a.id)).toEqual(['a2'])
  })

  it('sortiert nach Ausgabetag, die aelteste zuerst', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('neu', 'm1', { assignedOn: '2026-09-22' }),
        assignment('alt', 'm1', { assignedOn: '2026-09-18' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['alt', 'neu'])
  })

  it('sortiert bei gleichem Ausgabetag nach Name', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('a1', 'm1', { name: 'Zähne putzen' }),
        assignment('a2', 'm1', { name: 'Bad putzen' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.name)).toEqual(['Bad putzen', 'Zähne putzen'])
  })

  it('sortiert auch die erledigten Aufgaben', () => {
    const done = { status: 'completed' as const, completedAt: '2026-09-22T09:00:00Z' }
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('neu', 'm1', { ...done, assignedOn: '2026-09-22' }),
        assignment('alt', 'm1', { ...done, assignedOn: '2026-09-18' }),
      ],
    )

    expect(lanes[0].completed.map((a) => a.id)).toEqual(['alt', 'neu'])
  })
})
```

- [x] **Step 7: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreLanes.test.ts
```

Erwartet: `Failed to resolve import "./choreLanes"`.

- [x] **Step 8: choreLanes implementieren**

`frontend/src/features/chores/choreLanes.ts`:

```ts
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'

export type ChoreLaneModel = {
  member: MemberResponse
  open: ChoreAssignmentResponse[]
  completed: ChoreAssignmentResponse[]
}

// Nach Ausgabetag: was am längsten liegt, steht oben. Bei Gleichstand nach
// Name, damit die Reihenfolge zwischen zwei Renderings stabil bleibt.
function byAgeThenName(a: ChoreAssignmentResponse, b: ChoreAssignmentResponse): number {
  return a.assignedOn === b.assignedOn
    ? a.name.localeCompare(b.name, 'de')
    : a.assignedOn.localeCompare(b.assignedOn)
}

/**
 * Eine Spalte je aktivem Mitglied — auch ohne Aufgaben, denn eine fehlende
 * Spalte sähe aus wie ein Fehler. Erledigtes bleibt bis zum nächsten Morgen
 * sichtbar und wandert ans Ende der Lane.
 */
export function buildChoreLanes(
  members: MemberResponse[],
  assignments: ChoreAssignmentResponse[],
): ChoreLaneModel[] {
  return members
    .filter((m) => m.isActive)
    .map((member) => {
      const mine = assignments.filter((a) => a.memberId === member.id)
      return {
        member,
        open: mine.filter((a) => a.status === 'open').sort(byAgeThenName),
        completed: mine.filter((a) => a.status === 'completed').sort(byAgeThenName),
      }
    })
}
```

- [x] **Step 9: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreLanes.test.ts
```

Erwartet: PASS, 7 Tests.

- [x] **Step 10: Den fehlschlagenden Test für undoWindow schreiben**

`frontend/src/features/chores/undoWindow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { canUndo, UNDO_WINDOW_MS } from './undoWindow'

const now = new Date('2026-09-22T09:05:00Z')

describe('canUndo', () => {
  it('erlaubt die Ruecknahme kurz nach dem Abhaken', () => {
    expect(canUndo('2026-09-22T09:04:00Z', now)).toBe(true)
  })

  it('verweigert sie nach Ablauf der fuenf Minuten', () => {
    expect(canUndo('2026-09-22T08:59:00Z', now)).toBe(false)
  })

  it('verweigert sie genau an der Grenze', () => {
    const grenze = new Date(now.getTime() - UNDO_WINDOW_MS).toISOString()
    expect(canUndo(grenze, now)).toBe(false)
  })

  it('verweigert sie ohne Erledigungszeitpunkt', () => {
    expect(canUndo(null, now)).toBe(false)
    expect(canUndo(undefined, now)).toBe(false)
  })
})
```

- [x] **Step 11: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/undoWindow.test.ts
```

Erwartet: `Failed to resolve import "./undoWindow"`.

- [x] **Step 12: undoWindow implementieren**

`frontend/src/features/chores/undoWindow.ts`:

```ts
/** Dieselbe Frist wie im Backend (`UNDO_WINDOW_SECONDS`). */
export const UNDO_WINDOW_MS = 5 * 60 * 1000

/**
 * Nur eine Anzeigeentscheidung: der Server prüft die Frist noch einmal und
 * antwortet nach Ablauf mit 400. Die Uhren müssen also nicht exakt gleich gehen.
 */
export function canUndo(completedAt: string | null | undefined, now: Date): boolean {
  if (!completedAt) return false
  return now.getTime() - Date.parse(completedAt) < UNDO_WINDOW_MS
}
```

- [x] **Step 13: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/undoWindow.test.ts
```

Erwartet: PASS, 4 Tests.

- [x] **Step 14: Den fehlschlagenden Test für choreOptimistic schreiben**

`frontend/src/features/chores/choreOptimistic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { patchAssignment } from './choreOptimistic'

function assignment(id: string): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId: 'm1',
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
  }
}

describe('patchAssignment', () => {
  it('aendert genau die getroffene Zuweisung', () => {
    const cache = { data: [assignment('a1'), assignment('a2')] }

    const next = patchAssignment(cache, 'a1', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' })

    expect(next!.data[0].status).toBe('completed')
    expect(next!.data[0].completedAt).toBe('2026-09-22T09:00:00Z')
    expect(next!.data[1].status).toBe('open')
  })

  it('laesst den urspruenglichen Cache unveraendert', () => {
    const cache = { data: [assignment('a1')] }

    patchAssignment(cache, 'a1', { status: 'completed' })

    expect(cache.data[0].status).toBe('open')
  })

  it('reicht einen leeren Cache unveraendert durch', () => {
    expect(patchAssignment(undefined, 'a1', { status: 'completed' })).toBeUndefined()
  })
})
```

- [x] **Step 15: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreOptimistic.test.ts
```

Erwartet: `Failed to resolve import "./choreOptimistic"`.

- [x] **Step 16: choreOptimistic implementieren**

`frontend/src/features/chores/choreOptimistic.ts`:

```ts
import type { ChoreAssignmentResponse } from '@/api/generated/model'

export type AssignmentsCache = { data: ChoreAssignmentResponse[] } | undefined

/**
 * Der einzige Verzweigungspunkt des optimistischen Abhakens — bewusst hier und
 * nicht im Hook, damit alle drei Fälle ohne React-Testaufbau prüfbar sind.
 */
export function patchAssignment(
  cache: AssignmentsCache,
  id: string,
  patch: Partial<ChoreAssignmentResponse>,
): AssignmentsCache {
  if (cache === undefined) return cache
  return { ...cache, data: cache.data.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
}
```

- [x] **Step 17: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreOptimistic.test.ts
```

Erwartet: PASS, 3 Tests.

- [x] **Step 18: Typprüfung und Lint**

```bash
cd frontend && npm run type-check && npx eslint src/features/chores --max-warnings 0
```

Erwartet: keine Ausgabe. Meldet `type-check` unbekannte Typen aus `@/api/generated/model`, wurde `npm run generate:api` aus Task 7, Step 4 noch nicht ausgeführt — nachholen.

- [x] **Step 19: Commit**

Die fünf neuen Module, ihre vier Tests und diesen Plan committen:

```
feat(chores): add pure modules for lanes, labels, undo window and cache patching
```

---

### Task 9: Query-Hooks für Vorlagen und Zuweisungen

**Files:**
- Create: `frontend/src/features/chores/useChores.ts` + `useChores.test.tsx`
- Create: `frontend/src/features/chores/useChoreAssignments.ts` + `useChoreAssignments.test.tsx`

**Interfaces:**
- Consumes: generierte Hooks aus `@/api/generated/endpoints/familyHubAPI` — `useListChores`, `useCreateChore`, `useUpdateChore`, `useDeleteChore`, `getListChoresQueryKey`, `useListChoreAssignments`, `useCompleteChoreAssignment`, `useUndoChoreAssignment`, `getListChoreAssignmentsQueryKey`; ferner `patchAssignment` aus `./choreOptimistic`.
- Produces:
  - `useChores(): { chores: ChoreResponse[]; isLoading: boolean; isError: boolean }`
  - `useCreateChoreMutation()`, `useUpdateChoreMutation()`, `useDeleteChoreMutation()`
  - `useChoreAssignments(): { assignments: ChoreAssignmentResponse[]; isLoading: boolean; isError: boolean }`
  - `useCompleteAssignmentMutation()`, `useUndoAssignmentMutation()`
  - `useNow(intervalMs: number): Date` und `NOW_TICK_MS = 30_000`

**Hinweis:** Die exakten Namen der generierten Hooks nach `npm run generate:api` in `frontend/src/api/generated/endpoints/familyHubAPI.ts` nachschlagen — orval leitet sie aus den `operationId`s ab (`listChores` → `useListChores`, `getListChoresQueryKey`). Weicht etwas ab, hier angleichen.

---

- [x] **Step 1: Den fehlschlagenden Test für useChores schreiben**

`frontend/src/features/chores/useChores.test.tsx`:

```tsx
import { vi, describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListChores: vi.fn(),
  useCreateChore: vi.fn(),
  useUpdateChore: vi.fn(),
  useDeleteChore: vi.fn(),
  getListChoresQueryKey: () => ['/api/v1/chores'],
}))

import {
  useListChores,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useChores,
  useCreateChoreMutation,
  useUpdateChoreMutation,
  useDeleteChoreMutation,
} from './useChores'

function makeWrapperWithClient() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useChores', () => {
  it('liefert die Vorlagen aus der Abfrage', () => {
    vi.mocked(useListChores).mockReturnValue({
      data: { data: [{ id: 'c1', name: 'Toilette putzen', icon: '🚽' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListChores>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChores(), { wrapper })

    expect(result.current.chores).toHaveLength(1)
    expect(result.current.chores[0].id).toBe('c1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('faellt auf eine leere Liste zurueck, solange nichts geladen ist', () => {
    vi.mocked(useListChores).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListChores>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChores(), { wrapper })

    expect(result.current.chores).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })
})

describe.each([
  ['useCreateChoreMutation', useCreateChore, useCreateChoreMutation],
  ['useUpdateChoreMutation', useUpdateChore, useUpdateChoreMutation],
  ['useDeleteChoreMutation', useDeleteChore, useDeleteChoreMutation],
] as const)('%s', (_name, generated, hook) => {
  it('invalidiert die Vorlagenliste nach Erfolg', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(generated).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => hook(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/chores'] })
  })
})
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/useChores.test.tsx
```

Erwartet: `Failed to resolve import "./useChores"`.

- [x] **Step 3: useChores implementieren**

`frontend/src/features/chores/useChores.ts`:

```ts
import {
  useListChores,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
  getListChoresQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { ChoreResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useChores() {
  const query = useListChores()
  return {
    chores: (query.data?.data ?? []) as ChoreResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateChoreMutation() {
  const queryClient = useQueryClient()
  return useCreateChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}

export function useUpdateChoreMutation() {
  const queryClient = useQueryClient()
  return useUpdateChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}

export function useDeleteChoreMutation() {
  const queryClient = useQueryClient()
  return useDeleteChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/useChores.test.tsx
```

Erwartet: PASS, 5 Tests.

- [x] **Step 5: Den fehlschlagenden Test für useChoreAssignments schreiben**

`frontend/src/features/chores/useChoreAssignments.test.tsx`:

```tsx
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListChoreAssignments: vi.fn(),
  useCompleteChoreAssignment: vi.fn(),
  useUndoChoreAssignment: vi.fn(),
  getListChoreAssignmentsQueryKey: () => ['/api/v1/chore-assignments'],
}))

import {
  useListChoreAssignments,
  useCompleteChoreAssignment,
  useUndoChoreAssignment,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useChoreAssignments,
  useCompleteAssignmentMutation,
  useUndoAssignmentMutation,
  useNow,
  NOW_TICK_MS,
} from './useChoreAssignments'

function makeWrapperWithClient() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const KEY = ['/api/v1/chore-assignments']

describe('useChoreAssignments', () => {
  it('liefert die Zuweisungen aus der Abfrage', () => {
    vi.mocked(useListChoreAssignments).mockReturnValue({
      data: { data: [{ id: 'a1', memberId: 'm1', status: 'open' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListChoreAssignments>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChoreAssignments(), { wrapper })

    expect(result.current.assignments).toHaveLength(1)
    expect(result.current.isError).toBe(false)
  })

  it('faellt auf eine leere Liste zurueck, solange nichts geladen ist', () => {
    vi.mocked(useListChoreAssignments).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useListChoreAssignments>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChoreAssignments(), { wrapper })

    expect(result.current.assignments).toEqual([])
    expect(result.current.isError).toBe(true)
  })
})

describe('useCompleteAssignmentMutation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
    vi.mocked(useCompleteChoreAssignment).mockImplementation(({ mutation } = {}) => {
      captured = mutation
      return { mutateAsync: vi.fn() } as never
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setzt die Zuweisung optimistisch auf erledigt', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    client.setQueryData(KEY, { data: [{ id: 'a1', status: 'open' }] })
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    await act(async () => { await captured.onMutate({ id: 'a1' }) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = client.getQueryData(KEY) as any
    expect(cached.data[0].status).toBe('completed')
    expect(cached.data[0].completedAt).toBe('2026-09-22T09:00:00.000Z')
  })

  it('stellt den vorherigen Stand bei einem Fehler wieder her', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    const before = { data: [{ id: 'a1', status: 'open' }] }
    client.setQueryData(KEY, before)
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    const context = await act(async () => captured.onMutate({ id: 'a1' }))
    await act(async () => { captured.onError(new Error('kaputt'), { id: 'a1' }, await context) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client.getQueryData(KEY) as any).data[0].status).toBe('open')
  })

  it('laedt die Liste nach Abschluss neu', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    await act(async () => { captured.onSettled() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY })
  })
})

describe('useUndoAssignmentMutation', () => {
  it('laedt die Liste nach Erfolg neu', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useUndoChoreAssignment).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useUndoAssignmentMutation(), { wrapper })

    await act(async () => { onSuccessRef.fn!({}) })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY })
  })
})

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rueckt die Uhr im Takt weiter', () => {
    const { result } = renderHook(() => useNow(NOW_TICK_MS))
    const first = result.current

    act(() => { vi.advanceTimersByTime(NOW_TICK_MS) })

    expect(result.current.getTime()).toBeGreaterThan(first.getTime())
  })

  it('raeumt den Taktgeber beim Abbau ab', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNow(NOW_TICK_MS))

    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })
})
```

- [x] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/useChoreAssignments.test.tsx
```

Erwartet: `Failed to resolve import "./useChoreAssignments"`.

- [x] **Step 7: useChoreAssignments implementieren**

`frontend/src/features/chores/useChoreAssignments.ts`:

```ts
import { useEffect, useState } from 'react'
import {
  useListChoreAssignments,
  useCompleteChoreAssignment,
  useUndoChoreAssignment,
  getListChoreAssignmentsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'
import { patchAssignment, type AssignmentsCache } from './choreOptimistic'

/** Taktrate der Rücknahme-Anzeige: alle 30 s neu bewerten, ob die Frist noch läuft. */
export const NOW_TICK_MS = 30_000

export function useChoreAssignments() {
  const query = useListChoreAssignments()
  return {
    assignments: (query.data?.data ?? []) as ChoreAssignmentResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/**
 * Optimistisches Abhaken: die Karte springt sofort um, ein Fehler stellt den
 * vorherigen Stand wieder her. Im Altsystem verschwand bei einem Fehler nur der
 * Spinner, ohne jede Meldung — die Meldung selbst gibt `ChoresView` aus.
 */
export function useCompleteAssignmentMutation() {
  const queryClient = useQueryClient()
  const queryKey = getListChoreAssignmentsQueryKey()
  return useCompleteChoreAssignment({
    mutation: {
      onMutate: async ({ id }: { id: string }) => {
        await queryClient.cancelQueries({ queryKey })
        const previous = queryClient.getQueryData<AssignmentsCache>(queryKey)
        queryClient.setQueryData<AssignmentsCache>(queryKey, (cache) =>
          patchAssignment(cache, id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          }),
        )
        return { previous }
      },
      onError: (_error, _variables, context) => {
        queryClient.setQueryData(queryKey, context?.previous)
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey }),
    },
  })
}

export function useUndoAssignmentMutation() {
  const queryClient = useQueryClient()
  return useUndoChoreAssignment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListChoreAssignmentsQueryKey() }),
    },
  })
}

/**
 * Eine im Takt weiterrückende Uhr. Ohne sie bliebe der „Rückgängig"-Knopf
 * stehen, bis die Ansicht aus einem anderen Grund neu rendert.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

Sollte `context?.previous` in `onError` einen unbedeckten Zweig hinterlassen, prüfe, ob der Generator `context` als optional typisiert — falls ja, ergänze einen Test, der `captured.onError(new Error('x'), { id: 'a1' }, undefined)` aufruft (dieser Fall tritt real auf, wenn `onMutate` selbst geworfen hat).

- [x] **Step 8: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/useChoreAssignments.test.tsx
```

Erwartet: PASS, 8 Tests.

- [x] **Step 9: Typprüfung und Lint**

```bash
cd frontend && npm run type-check && npx eslint src/features/chores --max-warnings 0
```

Erwartet: keine Ausgabe.

- [x] **Step 10: Commit**

Beide Hook-Dateien, beide Tests und diesen Plan committen:

```
feat(chores): add query hooks with optimistic completion
```

---

### Task 10: Karte und Spalte

**Files:**
- Create: `frontend/src/features/chores/ChoreCard.tsx` + `ChoreCard.test.tsx`
- Create: `frontend/src/features/chores/ChoreLane.tsx` + `ChoreLane.test.tsx`

**Interfaces:**
- Consumes: `ChoreLaneModel` aus `./choreLanes`, `canUndo` aus `./undoWindow`, `memberColorHex` aus `@/features/members/colors`, `ChoreAssignmentResponse`.
- Produces:
  - `ChoreCard({ assignment, color, undoable, onComplete, onUndo })`
  - `ChoreLane({ lane, now, onComplete, onUndo })`

---

- [x] **Step 1: Den fehlschlagenden Test für ChoreCard schreiben**

`frontend/src/features/chores/ChoreCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { ChoreCard } from './ChoreCard'

function assignment(overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id: 'a1',
    choreId: 'c1',
    memberId: 'm1',
    name: 'Toilette putzen',
    icon: '🚽',
    description: 'Auch den Spiegel!',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

describe('ChoreCard', () => {
  it('zeigt Emoji, Name und Beschreibung', () => {
    render(<ChoreCard assignment={assignment()} color="#f0f" undoable={false} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('🚽')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
    expect(screen.getByText('Auch den Spiegel!')).toBeInTheDocument()
  })

  it('laesst die Beschreibung weg, wenn keine gepflegt ist', () => {
    render(
      <ChoreCard
        assignment={assignment({ description: null })}
        color="#f0f"
        undoable={false}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('chore-description')).not.toBeInTheDocument()
  })

  it('meldet einen Tipp auf das Abhak-Feld', async () => {
    const onComplete = vi.fn()
    render(<ChoreCard assignment={assignment()} color="#f0f" undoable={false} onComplete={onComplete} onUndo={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(onComplete).toHaveBeenCalledWith('a1')
  })

  it('stellt eine erledigte Aufgabe durchgestrichen dar', () => {
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable={false}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByText('Toilette putzen')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).not.toBeInTheDocument()
  })

  it('bietet innerhalb der Frist Rueckgaengig an', async () => {
    const onUndo = vi.fn()
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable
        onComplete={vi.fn()}
        onUndo={onUndo}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(onUndo).toHaveBeenCalledWith('a1')
  })

  it('zeigt bei einer erledigten Aufgabe kein Abhak-Feld mehr', () => {
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Toilette putzen erledigt' })).not.toBeInTheDocument()
  })
})
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreCard.test.tsx
```

Erwartet: `Failed to resolve import "./ChoreCard"`.

- [x] **Step 3: ChoreCard implementieren**

`frontend/src/features/chores/ChoreCard.tsx`:

```tsx
import { Check, Undo2 } from 'lucide-react'
import type { ChoreAssignmentResponse } from '@/api/generated/model'

type ChoreCardProps = {
  assignment: ChoreAssignmentResponse
  color: string
  undoable: boolean
  onComplete: (id: string) => void
  onUndo: (id: string) => void
}

/**
 * Abgehakt wird über einen eigenen großen Knopf, nicht über die ganze Karte:
 * beim Wischen durch eine Liste wäre eine flächig tippbare Karte zu leicht
 * versehentlich ausgelöst. Das Emoji trägt die Information — Name und
 * Beschreibung stehen daneben, sind aber nicht nötig, um die Aufgabe zu
 * erkennen.
 */
export function ChoreCard({ assignment, color, undoable, onComplete, onUndo }: ChoreCardProps) {
  const done = assignment.status === 'completed'
  return (
    <li className={`flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ${done ? 'opacity-60' : ''}`}>
      <span aria-hidden className="text-[56px] leading-none">{assignment.icon}</span>

      <span className="flex-1 min-w-0">
        <span className={`block text-xl font-semibold ${done ? 'line-through text-muted' : 'text-primary'}`}>
          {assignment.name}
        </span>
        {assignment.description && (
          <span data-testid="chore-description" className="block text-sm text-muted">
            {assignment.description}
          </span>
        )}
      </span>

      {done ? (
        undoable && (
          <button
            type="button"
            aria-label="Rückgängig"
            onClick={() => onUndo(assignment.id)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-muted"
          >
            <Undo2 aria-hidden />
          </button>
        )
      ) : (
        <button
          type="button"
          aria-label={`${assignment.name} erledigt`}
          onClick={() => onComplete(assignment.id)}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 bg-surface"
          style={{ borderColor: color }}
        >
          <Check aria-hidden className="h-8 w-8" style={{ color }} />
        </button>
      )}
    </li>
  )
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreCard.test.tsx
```

Erwartet: PASS, 6 Tests.

- [x] **Step 5: Den fehlschlagenden Test für ChoreLane schreiben**

`frontend/src/features/chores/ChoreLane.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'
import type { ChoreLaneModel } from './choreLanes'
import { ChoreLane } from './ChoreLane'

const member: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function assignment(id: string, overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId: 'm1',
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

function lane(overrides: Partial<ChoreLaneModel> = {}): ChoreLaneModel {
  return { member, open: [], completed: [], ...overrides }
}

const now = new Date('2026-09-22T09:02:00Z')

describe('ChoreLane', () => {
  it('zeigt den Namen des Mitglieds', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('feiert eine leere Liste', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('Alles erledigt! 🎉')).toBeInTheDocument()
  })

  it('zaehlt die offenen Aufgaben', () => {
    render(
      <ChoreLane
        lane={lane({ open: [assignment('a1'), assignment('a2')] })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByText('2 offen')).toBeInTheDocument()
  })

  it('zeigt bei genau einer Aufgabe die Einzahl', () => {
    render(<ChoreLane lane={lane({ open: [assignment('a1')] })} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('1 offen')).toBeInTheDocument()
  })

  it('stellt erledigte Aufgaben hinter die offenen', () => {
    render(
      <ChoreLane
        lane={lane({
          open: [assignment('offen', { name: 'Noch offen' })],
          completed: [
            assignment('fertig', { name: 'Schon fertig', status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
          ],
        })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Noch offen')
    expect(items[1]).toHaveTextContent('Schon fertig')
  })

  it('bietet Rueckgaengig nur innerhalb der Frist an', () => {
    render(
      <ChoreLane
        lane={lane({
          completed: [
            assignment('frisch', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
            assignment('alt', { status: 'completed', completedAt: '2026-09-22T08:00:00Z' }),
          ],
        })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Rückgängig' })).toHaveLength(1)
  })

  it('zeigt den Avatar, wenn einer hinterlegt ist', () => {
    render(
      <ChoreLane
        lane={lane({ member: { ...member, avatarUrl: '/api/v1/members/m1/avatar' } })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Anna' })).toBeInTheDocument()
  })

  it('zeigt sonst den Anfangsbuchstaben', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
```

- [x] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreLane.test.tsx
```

Erwartet: `Failed to resolve import "./ChoreLane"`.

- [x] **Step 7: ChoreLane implementieren**

`frontend/src/features/chores/ChoreLane.tsx`:

```tsx
import { memberColorHex } from '@/features/members/colors'
import { ChoreCard } from './ChoreCard'
import { canUndo } from './undoWindow'
import type { ChoreLaneModel } from './choreLanes'

type ChoreLaneProps = {
  lane: ChoreLaneModel
  now: Date
  onComplete: (id: string) => void
  onUndo: (id: string) => void
}

/**
 * Eine Spalte je aktivem Mitglied — auch ohne Aufgaben. Erledigtes bleibt bis
 * zum nächsten Morgen sichtbar: ein Kind soll sehen, was es geschafft hat,
 * statt dass die Aufgabe spurlos verschwindet.
 */
export function ChoreLane({ lane, now, onComplete, onUndo }: ChoreLaneProps) {
  const color = memberColorHex(lane.member.color)
  const countLabel = lane.open.length === 0 ? 'Alles erledigt! 🎉' : `${lane.open.length} offen`

  return (
    <section className="flex min-w-[20rem] flex-col gap-3 rounded-2xl bg-surface p-4">
      <header className="flex items-center gap-3">
        <span
          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-2"
          style={{ boxShadow: `0 0 0 4px ${color}` }}
        >
          {lane.member.avatarUrl ? (
            <img src={lane.member.avatarUrl} alt={lane.member.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-primary">{lane.member.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <span>
          <span className="block text-xl font-bold text-primary">{lane.member.name}</span>
          <span className="block text-sm text-muted">{countLabel}</span>
        </span>
      </header>

      <ul className="flex flex-col gap-3">
        {lane.open.map((a) => (
          <ChoreCard
            key={a.id}
            assignment={a}
            color={color}
            undoable={false}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        ))}
        {lane.completed.map((a) => (
          <ChoreCard
            key={a.id}
            assignment={a}
            color={color}
            undoable={canUndo(a.completedAt, now)}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        ))}
      </ul>
    </section>
  )
}
```

- [x] **Step 8: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreLane.test.tsx
```

Erwartet: PASS, 8 Tests.

- [x] **Step 9: Typprüfung und Lint**

```bash
cd frontend && npm run type-check && npx eslint src/features/chores --max-warnings 0
```

Erwartet: keine Ausgabe.

- [x] **Step 10: Commit**

Beide Komponenten, beide Tests und diesen Plan committen:

```
feat(chores): add chore card and per-member lane
```

---

### Task 11: Familienansicht und Bereichsnavigation

**Files:**
- Create: `frontend/src/features/chores/ChoresView.tsx` + `ChoresView.test.tsx`
- Modify: `frontend/src/routing/AppShell.tsx:6-10` (`SECTIONS`) und die Doku-Zeile darüber
- Modify: `frontend/src/routing/AppShell.test.tsx` (Testtitel und Erwartungen um „Haushalt" erweitern)
- Modify: `frontend/src/App.tsx` (Route `/chores`)
- Modify: `frontend/src/App.test.tsx` (Route-Test für `/chores`)

**Interfaces:**
- Consumes: `useChoreAssignments`, `useCompleteAssignmentMutation`, `useUndoAssignmentMutation`, `useNow`, `NOW_TICK_MS` aus `./useChoreAssignments`; `useMembers` aus `@/features/members/useMembersQuery`; `buildChoreLanes` aus `./choreLanes`; `ChoreLane`; `useSnackbar` aus `@/routing/SnackbarProvider`; `getListChoreAssignmentsQueryKey`.
- Produces: `ChoresView()` — die Route `/chores`.

---

- [x] **Step 1: Den fehlschlagenden Test für ChoresView schreiben**

`frontend/src/features/chores/ChoresView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'

const mutateComplete = vi.fn()
const mutateUndo = vi.fn()

vi.mock('./useChoreAssignments', async () => {
  const actual = await vi.importActual<typeof import('./useChoreAssignments')>('./useChoreAssignments')
  return {
    ...actual,
    useChoreAssignments: vi.fn(),
    useCompleteAssignmentMutation: () => ({ mutate: mutateComplete }),
    useUndoAssignmentMutation: () => ({ mutate: mutateUndo }),
  }
})

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useChoreAssignments } from './useChoreAssignments'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoresView } from './ChoresView'

const anna: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function assignment(overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id: 'a1',
    choreId: 'c1',
    memberId: 'm1',
    name: 'Toilette putzen',
    icon: '🚽',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

function mockState({
  assignments = [] as ChoreAssignmentResponse[],
  members = [anna],
  isLoading = false,
  isError = false,
} = {}) {
  vi.mocked(useChoreAssignments).mockReturnValue({ assignments, isLoading, isError })
  vi.mocked(useMembers).mockReturnValue({ members, isLoading: false, isError: false })
}

describe('ChoresView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('zeigt die Kopfzeile', () => {
    mockState()
    renderWithProviders(<ChoresView />)

    expect(screen.getByRole('heading', { name: 'Haushalt' })).toBeInTheDocument()
  })

  it('zeigt einen Ladezustand', () => {
    mockState({ isLoading: true })
    renderWithProviders(<ChoresView />)

    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('zeigt einen Fehlerzustand', () => {
    mockState({ isError: true })
    renderWithProviders(<ChoresView />)

    expect(screen.getByText('Fehler beim Laden der Haushaltsaufgaben.')).toBeInTheDocument()
  })

  it('weist auf fehlende Mitglieder hin', () => {
    mockState({ members: [] })
    renderWithProviders(<ChoresView />)

    expect(screen.getByText('Noch keine Familienmitglieder angelegt.')).toBeInTheDocument()
  })

  it('zeigt je Mitglied eine Spalte mit seinen Aufgaben', () => {
    mockState({ assignments: [assignment()] })
    renderWithProviders(<ChoresView />)

    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
  })

  it('hakt eine Aufgabe ab', async () => {
    mockState({ assignments: [assignment()] })
    renderWithProviders(<ChoresView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(mutateComplete).toHaveBeenCalledWith({ id: 'a1' }, expect.anything())
  })

  it('meldet ein fehlgeschlagenes Abhaken ueber eine Snackbar', async () => {
    mutateComplete.mockImplementation((_vars, handlers) => handlers.onError())
    mockState({ assignments: [assignment()] })
    renderWithProviders(<ChoresView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abhaken fehlgeschlagen. Bitte noch einmal versuchen.',
    )
  })

  it('nimmt eine Erledigung zurueck', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:01:00Z'))
    mockState({
      assignments: [assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })],
    })
    renderWithProviders(<ChoresView />)

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(mutateUndo).toHaveBeenCalledWith({ id: 'a1' }, expect.anything())
    vi.useRealTimers()
  })

  it('meldet ein fehlgeschlagenes Zuruecknehmen', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:01:00Z'))
    mutateUndo.mockImplementation((_vars, handlers) => handlers.onError())
    mockState({
      assignments: [assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })],
    })
    renderWithProviders(<ChoresView />)

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rückgängig fehlgeschlagen. Die 5-Minuten-Frist ist vermutlich abgelaufen.',
    )
    vi.useRealTimers()
  })
})
```

Der Test für „Rückgängig" setzt die Systemzeit, weil `ChoresView` die Frist über `useNow` bewertet. Nutzt der Aufbau `vi.setSystemTime` ohne vorheriges `vi.useFakeTimers()`, ergänze es in einem `beforeEach` der beiden betroffenen Tests — `userEvent` braucht dann `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoresView.test.tsx
```

Erwartet: `Failed to resolve import "./ChoresView"`.

- [x] **Step 3: ChoresView implementieren**

`frontend/src/features/chores/ChoresView.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { getListChoreAssignmentsQueryKey } from '@/api/generated/endpoints/familyHubAPI'
import { useMembers } from '@/features/members/useMembersQuery'
import { useSnackbar } from '@/routing/SnackbarProvider'
import { ChoreLane } from './ChoreLane'
import { buildChoreLanes } from './choreLanes'
import {
  useChoreAssignments,
  useCompleteAssignmentMutation,
  useUndoAssignmentMutation,
  useNow,
  NOW_TICK_MS,
} from './useChoreAssignments'

/**
 * Das Wanddisplay-Raster: `auto-fit` mit fester Mindestbreite je Spalte. Bei
 * vielen Mitgliedern scrollt es waagerecht, statt die Spalten unlesbar schmal
 * zu quetschen.
 */
export function ChoresView() {
  const queryClient = useQueryClient()
  const { assignments, isLoading, isError } = useChoreAssignments()
  const { members } = useMembers()
  const { show } = useSnackbar()
  const now = useNow(NOW_TICK_MS)
  const completeMutation = useCompleteAssignmentMutation()
  const undoMutation = useUndoAssignmentMutation()

  const lanes = buildChoreLanes(members, assignments)

  function handleComplete(id: string) {
    completeMutation.mutate(
      { id },
      {
        onError: () =>
          show({ id: `chore-complete-${id}`, message: 'Abhaken fehlgeschlagen. Bitte noch einmal versuchen.' }),
      },
    )
  }

  function handleUndo(id: string) {
    undoMutation.mutate(
      { id },
      {
        onError: () =>
          show({
            id: `chore-undo-${id}`,
            message: 'Rückgängig fehlgeschlagen. Die 5-Minuten-Frist ist vermutlich abgelaufen.',
          }),
      },
    )
  }

  function handleRetry() {
    void queryClient.invalidateQueries({ queryKey: getListChoreAssignmentsQueryKey() })
  }

  return (
    <div className="min-h-screen bg-bg p-4 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary mr-auto">Haushalt</h1>
      </header>

      {isError && (
        <div className="flex items-center gap-3 rounded-xl bg-danger-weak p-3">
          <span className="text-danger">Fehler beim Laden der Haushaltsaufgaben.</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-danger px-3 py-2 min-h-[44px] text-white"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Wird geladen…</p>}

      {!isLoading && !isError && lanes.length === 0 && (
        <p className="text-muted">Noch keine Familienmitglieder angelegt.</p>
      )}

      {!isLoading && !isError && lanes.length > 0 && (
        <div className="grid gap-4 overflow-x-auto [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
          {lanes.map((lane) => (
            <ChoreLane
              key={lane.member.id}
              lane={lane}
              now={now}
              onComplete={handleComplete}
              onUndo={handleUndo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoresView.test.tsx
```

Erwartet: PASS, 9 Tests.

- [x] **Step 5: Bereichsnavigation um „Haushalt" erweitern**

In `frontend/src/routing/AppShell.tsx` die `SECTIONS`-Liste und den Doku-Kommentar ändern:

```tsx
const SECTIONS = [
  { to: '/', label: 'Kalender' },
  { to: '/tasks', label: 'Aufgaben' },
  { to: '/chores', label: 'Haushalt' },
  { to: '/settings', label: 'Einstellungen' },
]

/**
 * Application frame. Renders the section navigation (Kalender/Aufgaben/
 * Haushalt/Einstellungen) above the page content, wraps everything in a
 * SnackbarProvider, and mounts the revoked-connection watcher, which pops a
 * per-account reconnect snackbar when a Google connection's token has
 * expired.
 */
```

In `frontend/src/routing/AppShell.test.tsx` den Test `renders links to calendar, tasks and settings` umbenennen in `renders links to calendar, tasks, chores and settings` und um die Zeile ergänzen:

```tsx
    expect(screen.getByRole('link', { name: 'Haushalt' })).toHaveAttribute('href', '/chores')
```

Im Test `marks the current section with aria-current` zusätzlich prüfen:

```tsx
    expect(screen.getByRole('link', { name: 'Haushalt' })).not.toHaveAttribute('aria-current')
```

- [x] **Step 6: Route `/chores` ergänzen**

In `frontend/src/App.tsx` den Import hinzufügen und die Route zwischen `/tasks` und `/settings` einsetzen:

```tsx
import { ChoresView } from '@/features/chores/ChoresView'
```

```tsx
        <Route
          path="/chores"
          element={
            <SetupGuard>
              <AppShell>
                <ChoresView />
              </AppShell>
            </SetupGuard>
          }
        />
```

In `frontend/src/App.test.tsx` den Stub zu den übrigen `vi.mock`-Aufrufen am Dateikopf ergänzen:

```tsx
vi.mock('@/features/chores/ChoresView', () => ({
  ChoresView: () => <div>HAUSHALT</div>,
}))
```

und im `describe('App routing')` einen Test nach dem vorhandenen `/tasks`-Muster ergänzen:

```tsx
  it('shows the chores view at /chores', () => {
    window.history.pushState({}, '', '/chores')
    render(<AppRoutes />)
    expect(screen.getByText('HAUSHALT')).toBeInTheDocument()
  })
```

- [x] **Step 7: Volles Frontend-Gate**

```bash
cd frontend && npm run check
```

Erwartet: kein TS-Fehler, keine eslint-Warnung, dependency-cruiser sauber, Coverage-Schwellen erfüllt. Bleibt eine Verzweigung offen, öffne `coverage/index.html` und suche die gelb markierte Zeile; die Regel aus den Global Constraints gilt: fehlende Fälle testen, nicht die Schwelle senken.

- [x] **Step 8: Commit**

`ChoresView`, ihren Test, `AppShell.tsx`, `AppShell.test.tsx`, `App.tsx`, `App.test.tsx` und diesen Plan committen:

```
feat(chores): add the family chores view and its section navigation entry
```

---

# Phase D — Einstellungen

**Phase D endet grün:** `scripts/pre-commit-check.sh` komplett grün.

Die Ämtli-Verwaltung bekommt eine **eigene Route `/settings/chores`**. `SettingsView` zeigt dafür nur eine Zeile „Haushalt · {n} Aufgaben →". Damit entsteht zugleich das Muster „Einstellungen mit Unterseiten", das die Schritte 7–9 ohnehin brauchen werden. Das `PinGate` liegt vor der Unterseite genauso wie vor `SettingsView`.

### Task 12: Zustandstext der Vorlage (choreStatus)

**Files:**
- Create: `frontend/src/features/chores/choreStatus.ts` + `choreStatus.test.ts`

**Interfaces:**
- Consumes: `ChoreResponse`, `MemberResponse` aus `@/api/generated/model`.
- Produces:
  - `type ChoreStatusTone = 'paused' | 'open' | 'due' | 'waiting' | 'blocked'`
  - `type ChoreStatus = { text: string; tone: ChoreStatusTone }`
  - `groupPoolSize(group: string, members: MemberResponse[]): number`
  - `choreStatus(chore: ChoreResponse, members: MemberResponse[], today: string): ChoreStatus` — `today` als ISO-Datum `YYYY-MM-DD`

**Warum das hier steht und nicht in der Familienansicht:** Das Warteschlangen-Modell nimmt der Familie die Kalenderfrage „wann ist das Bad wieder dran?" — für ein Kind ist genau das richtig, für einen Elternteil nicht. Die Verwaltungsseite ist der Ort, an dem der sonst unsichtbare Ausgabelauf nachvollziehbar wird. Die Unterscheidung „wartet auf Platz" gegen „Gruppe ist leer" trifft das Frontend aus der ohnehin geladenen Mitgliederliste — der Server bleibt dumm, und die gesamte Verzweigung liegt hier und ist damit erschöpfend testbar.

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`frontend/src/features/chores/choreStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ChoreResponse, MemberResponse } from '@/api/generated/model'
import { choreStatus, groupPoolSize } from './choreStatus'

const TODAY = '2026-09-22'

function member(id: string, role: 'parent' | 'child', isActive = true): MemberResponse {
  return { id, name: id, role, color: 'blue', isActive, createdAt: '', updatedAt: '' }
}

const papa = member('papa', 'parent')
const anna = member('anna', 'child')

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'all',
    points: 10,
    isActive: true,
    nextDueOn: TODAY,
    ...overrides,
  }
}

function open(memberName: string, assignedOn: string) {
  return { id: 'a1', memberId: 'm1', memberName, assignedOn }
}

// ─── groupPoolSize ──────────────────────────────────────────────────────────

describe('groupPoolSize', () => {
  it('zaehlt bei parents nur Eltern', () => {
    expect(groupPoolSize('parents', [papa, anna])).toBe(1)
  })

  it('zaehlt bei children nur Kinder', () => {
    expect(groupPoolSize('children', [papa, anna])).toBe(1)
  })

  it('zaehlt bei all alle', () => {
    expect(groupPoolSize('all', [papa, anna])).toBe(2)
  })

  it('laesst inaktive Mitglieder weg', () => {
    expect(groupPoolSize('all', [papa, member('ben', 'child', false)])).toBe(1)
  })
})

// ─── choreStatus ────────────────────────────────────────────────────────────

describe('choreStatus', () => {
  it('meldet eine pausierte Vorlage, noch vor allem anderen', () => {
    const status = choreStatus(chore({ isActive: false, openAssignment: open('Anna', TODAY) }), [anna], TODAY)

    expect(status).toEqual({ text: 'Pausiert', tone: 'paused' })
  })

  it('nennt den Traeger einer heute ausgegebenen Aufgabe', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', TODAY) }), [anna], TODAY)

    expect(status).toEqual({ text: 'Offen bei Anna · seit heute', tone: 'open' })
  })

  it('setzt bei einem Tag die Einzahl', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', '2026-09-21') }), [anna], TODAY)

    expect(status.text).toBe('Offen bei Anna · seit 1 Tag')
  })

  it('zaehlt aeltere Aufgaben in Tagen', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', '2026-09-18') }), [anna], TODAY)

    expect(status.text).toBe('Offen bei Anna · seit 4 Tagen')
  })

  it('kuendigt eine morgen faellige Vorlage an', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-23' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wieder fällig morgen', tone: 'due' })
  })

  it('zaehlt die Tage bis zur naechsten Faelligkeit', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-29' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wieder fällig in 7 Tagen', tone: 'due' })
  })

  it('erklaert eine leere Zuweisungsgruppe', () => {
    const status = choreStatus(chore({ assignmentGroup: 'children' }), [papa], TODAY)

    expect(status).toEqual({ text: 'Keine Mitglieder in dieser Gruppe', tone: 'blocked' })
  })

  it('erklaert eine faellige Vorlage ohne freien Platz', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-20' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wartet auf freien Platz', tone: 'waiting' })
  })

  it('behandelt eine heute faellige Vorlage wie eine wartende', () => {
    const status = choreStatus(chore({ nextDueOn: TODAY }), [anna], TODAY)

    expect(status.tone).toBe('waiting')
  })
})
```

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreStatus.test.ts
```

Erwartet: `Failed to resolve import "./choreStatus"`.

- [x] **Step 3: choreStatus implementieren**

`frontend/src/features/chores/choreStatus.ts`:

```ts
import type { ChoreResponse, MemberResponse } from '@/api/generated/model'

export type ChoreStatusTone = 'paused' | 'open' | 'due' | 'waiting' | 'blocked'
export type ChoreStatus = { text: string; tone: ChoreStatusTone }

// Beide Werte sind reine Kalenderdaten (YYYY-MM-DD) aus der Haushaltszeitzone;
// über Date.UTC verglichen gibt es keine Zeitzonen-Verschiebung um einen Tag.
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function inGroup(member: MemberResponse, group: string): boolean {
  if (group === 'parents') return member.role === 'parent'
  if (group === 'children') return member.role === 'child'
  return true
}

export function groupPoolSize(group: string, members: MemberResponse[]): number {
  return members.filter((m) => m.isActive && inGroup(m, group)).length
}

function ageText(days: number): string {
  if (days === 0) return 'seit heute'
  if (days === 1) return 'seit 1 Tag'
  return `seit ${days} Tagen`
}

/**
 * Der Zustandstext einer Vorlage auf der Verwaltungsseite. Er beantwortet die
 * Frage, die die Familienansicht bewusst nicht stellt: warum taucht diese
 * Aufgabe gerade nirgends auf? Ohne ihn gäbe es keine Stelle, an der man einem
 * stillstehenden Ämtli nachgehen könnte.
 */
export function choreStatus(
  chore: ChoreResponse,
  members: MemberResponse[],
  today: string,
): ChoreStatus {
  if (!chore.isActive) return { text: 'Pausiert', tone: 'paused' }

  const open = chore.openAssignment
  if (open) {
    return { text: `Offen bei ${open.memberName} · ${ageText(daysBetween(open.assignedOn, today))}`, tone: 'open' }
  }

  const daysUntilDue = daysBetween(today, chore.nextDueOn)
  if (daysUntilDue > 0) {
    const text = daysUntilDue === 1 ? 'Wieder fällig morgen' : `Wieder fällig in ${daysUntilDue} Tagen`
    return { text, tone: 'due' }
  }

  // Fällig, aber nicht ausgegeben: entweder ist die Gruppe leer, oder alle in
  // ihr stehen am Limit von fünf offenen Aufgaben.
  if (groupPoolSize(chore.assignmentGroup, members) === 0) {
    return { text: 'Keine Mitglieder in dieser Gruppe', tone: 'blocked' }
  }
  return { text: 'Wartet auf freien Platz', tone: 'waiting' }
}
```

Abweichung vom Spec, bewusst: der Spec schreibt für die offene Zuweisung pauschal „seit {n} Tagen". `ageText` bildet zusätzlich „seit heute" und „seit 1 Tag" ab — „seit 0 Tagen" wäre auf einem Familiendisplay falsches Deutsch.

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/choreStatus.test.ts
```

Erwartet: PASS, 13 Tests.

- [x] **Step 5: Commit**

`choreStatus.ts`, seinen Test und diesen Plan committen:

```
feat(chores): add the admin-page status text for a chore template
```

---

### Task 13: Vorlagen-Dialog

**Files:**
- Create: `frontend/src/features/chores/ChoreDialog.tsx` + `ChoreDialog.test.tsx`

**Interfaces:**
- Consumes: `useCreateChoreMutation`, `useUpdateChoreMutation`, `useDeleteChoreMutation` aus `./useChores`; `CHORE_ICONS`, `DEFAULT_CHORE_ICON` aus `./choreIcons`; `INTERVAL_OPTIONS`, `GROUP_OPTIONS`, `type ChoreGroup` aus `./choreLabels`; `ChoreResponse`.
- Produces: `ChoreDialog({ chore, onClose })` — `chore: ChoreResponse | null`, `null` heißt „Neue Aufgabe".

---

- [x] **Step 1: Den fehlschlagenden Test schreiben**

`frontend/src/features/chores/ChoreDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import type { ChoreResponse } from '@/api/generated/model'

const createAsync = vi.fn()
const updateAsync = vi.fn()
const deleteAsync = vi.fn()

vi.mock('./useChores', () => ({
  useCreateChoreMutation: () => ({ mutateAsync: createAsync, isPending: false }),
  useUpdateChoreMutation: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteChoreMutation: () => ({ mutateAsync: deleteAsync, isPending: false }),
}))

import { ChoreDialog } from './ChoreDialog'

const bestehend: ChoreResponse = {
  id: 'c1',
  name: 'Toilette putzen',
  icon: '🚽',
  description: 'Auch den Spiegel!',
  intervalDays: 7,
  assignmentGroup: 'children',
  points: 15,
  isActive: true,
  nextDueOn: '2026-09-29',
}

describe('ChoreDialog — Anlegen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('oeffnet mit dem Titel Neue Aufgabe', () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Neue Aufgabe' })).toBeInTheDocument()
  })

  it('legt eine Vorlage mit den Voreinstellungen an', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={null} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Müll rausbringen')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).toHaveBeenCalledWith({
      data: {
        name: 'Müll rausbringen',
        icon: '🧹',
        description: null,
        intervalDays: 7,
        assignmentGroup: 'all',
        points: 10,
      },
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('uebernimmt Emoji, Intervall, Gruppe und Punkte aus der Auswahl', async () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Bad putzen')
    await userEvent.click(screen.getByRole('button', { name: 'Symbol 🚽' }))
    await userEvent.click(screen.getByRole('button', { name: 'Täglich' }))
    await userEvent.click(screen.getByRole('button', { name: 'Kinder' }))
    const slider = screen.getByLabelText('Punkte')
    await userEvent.clear(slider)
    // Schieberegler: Wert direkt setzen, Tastatureingabe wäre 45 Pfeiltasten.
    await userEvent.type(slider, '')

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ icon: '🚽', intervalDays: 1, assignmentGroup: 'children' }),
      }),
    )
  })

  it('speichert nicht ohne Namen', async () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte einen Namen eingeben.')).toBeInTheDocument()
  })

  it('meldet einen fehlgeschlagenen Speichervorgang', async () => {
    createAsync.mockRejectedValueOnce(new Error('kaputt'))
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Müll')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeInTheDocument()
  })

  it('schliesst beim Abbrechen ohne zu speichern', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={null} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(createAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('bietet beim Anlegen kein Loeschen an', () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })
})

describe('ChoreDialog — Bearbeiten', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fuellt das Formular mit der Vorlage', () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Toilette putzen')
    expect(screen.getByLabelText('Beschreibung')).toHaveValue('Auch den Spiegel!')
    expect(screen.getByRole('button', { name: 'Kinder' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Wöchentlich' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('speichert die Aenderung', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Bad putzen')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', data: expect.objectContaining({ name: 'Bad putzen' }) }),
    )
  })

  it('leert eine entfernte Beschreibung ueber clearFields', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.clear(screen.getByLabelText('Beschreibung'))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clearFields: ['description'] }) }),
    )
  })

  it('schickt ohne vorherige Beschreibung kein clearFields', async () => {
    renderWithProviders(<ChoreDialog chore={{ ...bestehend, description: null }} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ clearFields: expect.anything() }) }),
    )
  })

  it('schaltet Aktiv um', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Aktiv' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    )
  })

  it('loescht erst nach Bestaetigung', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(deleteAsync).not.toHaveBeenCalled()
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))

    expect(deleteAsync).toHaveBeenCalledWith({ id: 'c1' })
    expect(onClose).toHaveBeenCalled()
  })

  it('meldet ein abgelehntes Loeschen', async () => {
    deleteAsync.mockRejectedValueOnce(new Error('400'))
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))

    expect(
      await screen.findByText('Löschen nicht möglich — die Aufgabe wurde bereits erledigt. Bitte pausieren.'),
    ).toBeInTheDocument()
  })

  it('nimmt die Loeschabsicht zurueck', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nein, behalten' }))

    expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument()
    expect(deleteAsync).not.toHaveBeenCalled()
  })
})
```

Der dritte Test („übernimmt Emoji, Intervall, Gruppe und Punkte") prüft den Schieberegler nicht mit; setze den Punktewert in diesem Test über `fireEvent.change(slider, { target: { value: '25' } })` aus `@testing-library/react` und ergänze die Erwartung `points: 25` — `userEvent` kann einen `range`-Eingang nicht sinnvoll bedienen.

- [x] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreDialog.test.tsx
```

Erwartet: `Failed to resolve import "./ChoreDialog"`.

- [x] **Step 3: ChoreDialog implementieren**

`frontend/src/features/chores/ChoreDialog.tsx`:

```tsx
import { useState } from 'react'
import type { ChoreResponse } from '@/api/generated/model'
import { CHORE_ICONS, DEFAULT_CHORE_ICON } from './choreIcons'
import { INTERVAL_OPTIONS, GROUP_OPTIONS, type ChoreGroup } from './choreLabels'
import { useCreateChoreMutation, useUpdateChoreMutation, useDeleteChoreMutation } from './useChores'

const POINTS_MIN = 5
const POINTS_MAX = 50
const POINTS_STEP = 5

type ChoreDialogProps = {
  chore: ChoreResponse | null
  onClose: () => void
}

/**
 * Anlegen und Bearbeiten in einem Dialog. Bestätigungen laufen über eigene
 * Schaltflächen, nie über `confirm()` — auf einem Wanddisplay ohne Tastatur
 * sind Browserdialoge unbedienbar.
 */
export function ChoreDialog({ chore, onClose }: ChoreDialogProps) {
  const editing = chore !== null

  const [name, setName] = useState(chore?.name ?? '')
  const [icon, setIcon] = useState(chore?.icon ?? DEFAULT_CHORE_ICON)
  const [description, setDescription] = useState(chore?.description ?? '')
  const [intervalDays, setIntervalDays] = useState(chore?.intervalDays ?? 7)
  const [group, setGroup] = useState<ChoreGroup>((chore?.assignmentGroup ?? 'all') as ChoreGroup)
  const [points, setPoints] = useState(chore?.points ?? 10)
  const [isActive, setIsActive] = useState(chore?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const createMutation = useCreateChoreMutation()
  const updateMutation = useUpdateChoreMutation()
  const deleteMutation = useDeleteChoreMutation()
  const isSaving = createMutation.isPending || updateMutation.isPending

  async function handleSubmit() {
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Bitte einen Namen eingeben.')
      return
    }
    const trimmedDescription = description.trim()
    const normalizedDescription = trimmedDescription === '' ? null : trimmedDescription

    try {
      if (chore === null) {
        await createMutation.mutateAsync({
          data: {
            name: trimmedName,
            icon,
            description: normalizedDescription,
            intervalDays,
            assignmentGroup: group,
            points,
          },
        })
      } else {
        // clearFields ist der einzige Weg, die Beschreibung per PATCH wirklich
        // zu leeren; ein weggelassener Wert bedeutet dort "unverändert".
        const clears = chore.description && normalizedDescription === null ? ['description' as const] : undefined
        await updateMutation.mutateAsync({
          id: chore.id,
          data: {
            name: trimmedName,
            icon,
            description: normalizedDescription ?? undefined,
            intervalDays,
            assignmentGroup: group,
            points,
            isActive,
            clearFields: clears,
          },
        })
      }
      onClose()
    } catch {
      setError('Speichern fehlgeschlagen.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteMutation.mutateAsync({ id: chore!.id })
      onClose()
    } catch {
      setError('Löschen nicht möglich — die Aufgabe wurde bereits erledigt. Bitte pausieren.')
      setConfirmDelete(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="my-8 flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-surface p-6">
        <h2 className="text-xl font-bold text-primary">{editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>

        <label className="flex flex-col gap-1 text-primary">
          Name
          <input
            aria-label="Name"
            placeholder="z. B. Toilette putzen"
            className="min-h-[44px] rounded-lg px-3 py-3 text-slate-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Symbol</legend>
          <div className="flex flex-wrap gap-2">
            {CHORE_ICONS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-label={`Symbol ${candidate}`}
                aria-pressed={icon === candidate}
                onClick={() => setIcon(candidate)}
                className={`min-h-[56px] min-w-[56px] rounded-xl text-3xl ${
                  icon === candidate ? 'bg-accent' : 'bg-surface-2'
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-primary">
          Beschreibung
          <input
            aria-label="Beschreibung"
            placeholder="z. B. Auch den Spiegel!"
            className="min-h-[44px] rounded-lg px-3 py-3 text-slate-900"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Wie oft?</legend>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                aria-pressed={intervalDays === option.days}
                onClick={() => setIntervalDays(option.days)}
                className={`min-h-[44px] rounded-full px-4 ${
                  intervalDays === option.days ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Wer?</legend>
          <div className="flex flex-wrap gap-2">
            {GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={group === option.value}
                onClick={() => setGroup(option.value)}
                className={`min-h-[44px] rounded-full px-4 ${
                  group === option.value ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-primary">
          {`Punkte: ${points}`}
          <input
            type="range"
            aria-label="Punkte"
            min={POINTS_MIN}
            max={POINTS_MAX}
            step={POINTS_STEP}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </label>

        {editing && (
          <button
            type="button"
            aria-label="Aktiv"
            aria-pressed={isActive}
            onClick={() => setIsActive((active) => !active)}
            className={`min-h-[44px] self-start rounded-full px-4 ${
              isActive ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
            }`}
          >
            Aktiv
          </button>
        )}

        {error && <p className="text-danger">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
            className="min-h-[44px] rounded-xl bg-accent px-4 text-white disabled:opacity-50"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
          >
            Abbrechen
          </button>

          {editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto min-h-[44px] rounded-xl bg-danger-weak px-4 text-danger"
            >
              Löschen
            </button>
          )}
        </div>

        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-weak p-3">
            <span className="text-danger">Wirklich löschen?</span>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="min-h-[44px] rounded-xl bg-danger px-4 text-white"
            >
              Ja, löschen
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
            >
              Nein, behalten
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [x] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreDialog.test.tsx
```

Erwartet: PASS, 15 Tests. Bleibt ein Zweig offen, sind die üblichen Verdächtigen `chore?.description ?? ''` (Test mit `description: null` existiert bereits — sonst ergänzen) und `normalizedDescription ?? undefined`.

- [x] **Step 5: Commit**

`ChoreDialog.tsx`, seinen Test und diesen Plan committen:

```
feat(chores): add the create/edit dialog for chore templates
```

---

### Task 14: Verwaltungsseite `/settings/chores`

**Files:**
- Create: `frontend/src/features/chores/ChoreSettingsRow.tsx` + `ChoreSettingsRow.test.tsx`
- Create: `frontend/src/features/chores/ChoreSettingsView.tsx` + `ChoreSettingsView.test.tsx`
- Create: `frontend/src/features/chores/ChoreSettingsLink.tsx` + `ChoreSettingsLink.test.tsx`
- Modify: `frontend/src/features/settings/SettingsView.tsx` (Zeile einhängen)
- Modify: `frontend/src/features/settings/SettingsView.test.tsx` (Zeile erwarten)
- Modify: `frontend/src/App.tsx` (Route `/settings/chores`)
- Modify: `frontend/src/App.test.tsx` (Route-Test)

**Interfaces:**
- Consumes: `useChores`, `useUpdateChoreMutation` aus `./useChores`; `choreStatus` aus `./choreStatus`; `intervalLabel`, `GROUP_LABELS`, `type ChoreGroup` aus `./choreLabels`; `ChoreDialog`; `useMembers`; `PinGate` aus `@/features/pin/PinGate`.
- Produces: `ChoreSettingsRow({ chore, status, onEdit, onToggleActive })`, `ChoreSettingsView()`, `ChoreSettingsLink()`.

---

- [ ] **Step 1: Den fehlschlagenden Test für ChoreSettingsRow schreiben**

`frontend/src/features/chores/ChoreSettingsRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChoreResponse } from '@/api/generated/model'
import { ChoreSettingsRow } from './ChoreSettingsRow'

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'children',
    points: 10,
    isActive: true,
    nextDueOn: '2026-09-29',
    ...overrides,
  }
}

const status = { text: 'Wieder fällig in 7 Tagen', tone: 'due' as const }

describe('ChoreSettingsRow', () => {
  it('zeigt Emoji, Name und die Konfigurationszeile', () => {
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={vi.fn()} />)

    expect(screen.getByText('🚽')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
    expect(screen.getByText('Wöchentlich · Kinder · 10 Pkt.')).toBeInTheDocument()
  })

  it('zeigt den Zustandstext', () => {
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={vi.fn()} />)

    expect(screen.getByText('Wieder fällig in 7 Tagen')).toBeInTheDocument()
  })

  it('bietet einer aktiven Vorlage Pausieren an', async () => {
    const onToggleActive = vi.fn()
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={onToggleActive} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen pausieren' }))

    expect(onToggleActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), false)
  })

  it('bietet einer pausierten Vorlage Aktivieren an', async () => {
    const onToggleActive = vi.fn()
    render(
      <ChoreSettingsRow
        chore={chore({ isActive: false })}
        status={{ text: 'Pausiert', tone: 'paused' }}
        onEdit={vi.fn()}
        onToggleActive={onToggleActive}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen aktivieren' }))

    expect(onToggleActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), true)
  })

  it('oeffnet den Bearbeiten-Dialog', async () => {
    const onEdit = vi.fn()
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={onEdit} onToggleActive={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen bearbeiten' }))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreSettingsRow.test.tsx
```

Erwartet: `Failed to resolve import "./ChoreSettingsRow"`.

- [ ] **Step 3: ChoreSettingsRow implementieren**

`frontend/src/features/chores/ChoreSettingsRow.tsx`:

```tsx
import { Pencil, Pause, Play } from 'lucide-react'
import type { ChoreResponse } from '@/api/generated/model'
import { intervalLabel, GROUP_LABELS, type ChoreGroup } from './choreLabels'
import type { ChoreStatus } from './choreStatus'

const TONE_CLASS: Record<ChoreStatus['tone'], string> = {
  paused: 'text-muted',
  open: 'text-primary',
  due: 'text-muted',
  waiting: 'text-warn',
  blocked: 'text-danger',
}

type ChoreSettingsRowProps = {
  chore: ChoreResponse
  status: ChoreStatus
  onEdit: (chore: ChoreResponse) => void
  onToggleActive: (chore: ChoreResponse, next: boolean) => void
}

export function ChoreSettingsRow({ chore, status, onEdit, onToggleActive }: ChoreSettingsRowProps) {
  const config = `${intervalLabel(chore.intervalDays)} · ${
    GROUP_LABELS[chore.assignmentGroup as ChoreGroup]
  } · ${chore.points} Pkt.`

  return (
    <li className={`flex items-center gap-4 rounded-2xl bg-surface-2 p-4 ${chore.isActive ? '' : 'opacity-60'}`}>
      <span aria-hidden className="text-4xl leading-none">{chore.icon}</span>

      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-primary">{chore.name}</span>
        <span className="block text-sm text-muted">{config}</span>
      </span>

      <span className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</span>

      <button
        type="button"
        aria-label={`${chore.name} ${chore.isActive ? 'pausieren' : 'aktivieren'}`}
        onClick={() => onToggleActive(chore, !chore.isActive)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface text-muted"
      >
        {chore.isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>

      <button
        type="button"
        aria-label={`${chore.name} bearbeiten`}
        onClick={() => onEdit(chore)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface text-muted"
      >
        <Pencil aria-hidden />
      </button>
    </li>
  )
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreSettingsRow.test.tsx
```

Erwartet: PASS, 5 Tests.

- [ ] **Step 5: Den fehlschlagenden Test für ChoreSettingsView schreiben**

`frontend/src/features/chores/ChoreSettingsView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import type { ChoreResponse, MemberResponse } from '@/api/generated/model'

const mutate = vi.fn()

vi.mock('./useChores', () => ({
  useChores: vi.fn(),
  useUpdateChoreMutation: () => ({ mutate }),
}))

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

// Das PinGate wird an anderer Stelle geprüft; hier steht die Seite selbst
// im Mittelpunkt.
vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./ChoreDialog', () => ({
  ChoreDialog: ({ chore }: { chore: ChoreResponse | null }) => (
    <div data-testid="chore-dialog">{chore ? chore.name : 'neu'}</div>
  ),
}))

import { useChores } from './useChores'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoreSettingsView } from './ChoreSettingsView'

const anna: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'all',
    points: 10,
    isActive: true,
    nextDueOn: '2026-09-29',
    ...overrides,
  }
}

function mockState({ chores = [] as ChoreResponse[], isLoading = false, isError = false } = {}) {
  vi.mocked(useChores).mockReturnValue({ chores, isLoading, isError })
  vi.mocked(useMembers).mockReturnValue({ members: [anna], isLoading: false, isError: false })
}

describe('ChoreSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('zeigt Kopfzeile und Rueckweg', () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByRole('heading', { name: 'Haushaltsaufgaben' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Zu den Einstellungen' })).toHaveAttribute('href', '/settings')
  })

  it('zeigt einen Ladezustand', () => {
    mockState({ isLoading: true })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('zeigt einen Fehlerzustand', () => {
    mockState({ isError: true })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Fehler beim Laden der Haushaltsaufgaben.')).toBeInTheDocument()
  })

  it('zeigt einen Leerzustand', () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Noch keine Haushaltsaufgaben angelegt.')).toBeInTheDocument()
  })

  it('listet die Vorlagen auf', () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
  })

  it('oeffnet den Dialog fuer eine neue Aufgabe', async () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Neue Aufgabe' }))

    expect(screen.getByTestId('chore-dialog')).toHaveTextContent('neu')
  })

  it('oeffnet den Dialog zum Bearbeiten', async () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen bearbeiten' }))

    expect(screen.getByTestId('chore-dialog')).toHaveTextContent('Toilette putzen')
  })

  it('pausiert eine Vorlage', async () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen pausieren' }))

    expect(mutate).toHaveBeenCalledWith({ id: 'c1', data: { isActive: false } })
  })
})
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreSettingsView.test.tsx
```

Erwartet: `Failed to resolve import "./ChoreSettingsView"`.

- [ ] **Step 7: ChoreSettingsView implementieren**

`frontend/src/features/chores/ChoreSettingsView.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { ChoreResponse } from '@/api/generated/model'
import { PinGate } from '@/features/pin/PinGate'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoreDialog } from './ChoreDialog'
import { ChoreSettingsRow } from './ChoreSettingsRow'
import { choreStatus } from './choreStatus'
import { useChores, useUpdateChoreMutation } from './useChores'

type DialogState = { chore: ChoreResponse | null }

/**
 * Eigene Unterseite statt Abschnitt in `SettingsView`: Die Ämtli-Verwaltung ist
 * echtes CRUD mit reichem Dialog und realistisch 10–20 Einträgen, bedient auf
 * einem 24-Zoll-Touchdisplay ohne Tastatur. Eine eigene Seite gibt ihr volle
 * Breite und große Touch-Ziele.
 */
export function ChoreSettingsView() {
  const { chores, isLoading, isError } = useChores()
  const { members } = useMembers()
  const updateMutation = useUpdateChoreMutation()
  const [dialog, setDialog] = useState<DialogState | null>(null)

  // Der Browser des Wanddisplays läuft in der Haushaltszeitzone; 'sv-SE'
  // liefert das ISO-Format YYYY-MM-DD, das choreStatus erwartet.
  const today = new Date().toLocaleDateString('sv-SE')

  function handleToggleActive(chore: ChoreResponse, next: boolean) {
    updateMutation.mutate({ id: chore.id, data: { isActive: next } })
  }

  return (
    <PinGate>
      <div className="min-h-screen bg-bg p-6 text-primary">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <Link to="/settings" className="flex min-h-[44px] items-center text-accent">
            ← Zu den Einstellungen
          </Link>

          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-primary">Haushaltsaufgaben</h1>
            <button
              type="button"
              aria-label="Neue Aufgabe"
              onClick={() => setDialog({ chore: null })}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-accent-weak text-accent"
            >
              <Plus aria-hidden />
            </button>
          </div>

          {isError && <p className="text-danger">Fehler beim Laden der Haushaltsaufgaben.</p>}

          {isLoading && <p className="text-muted">Wird geladen…</p>}

          {!isLoading && !isError && chores.length === 0 && (
            <p className="text-muted">Noch keine Haushaltsaufgaben angelegt.</p>
          )}

          {!isLoading && !isError && chores.length > 0 && (
            <ul className="flex flex-col gap-3">
              {chores.map((chore) => (
                <ChoreSettingsRow
                  key={chore.id}
                  chore={chore}
                  status={choreStatus(chore, members, today)}
                  onEdit={(selected) => setDialog({ chore: selected })}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {dialog && <ChoreDialog chore={dialog.chore} onClose={() => setDialog(null)} />}
    </PinGate>
  )
}
```

- [ ] **Step 8: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreSettingsView.test.tsx
```

Erwartet: PASS, 8 Tests.

- [ ] **Step 9: Den fehlschlagenden Test für ChoreSettingsLink schreiben**

`frontend/src/features/chores/ChoreSettingsLink.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('./useChores', () => ({ useChores: vi.fn() }))

import { useChores } from './useChores'
import { ChoreSettingsLink } from './ChoreSettingsLink'

describe('ChoreSettingsLink', () => {
  it('fuehrt auf die Unterseite und zaehlt die Aufgaben', () => {
    vi.mocked(useChores).mockReturnValue({
      chores: [{ id: 'c1' }, { id: 'c2' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChores>)

    renderWithProviders(<ChoreSettingsLink />)

    const link = screen.getByRole('link', { name: /Haushalt/ })
    expect(link).toHaveAttribute('href', '/settings/chores')
    expect(link).toHaveTextContent('Haushalt · 2 Aufgaben')
  })

  it('setzt bei genau einer Aufgabe die Einzahl', () => {
    vi.mocked(useChores).mockReturnValue({
      chores: [{ id: 'c1' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChores>)

    renderWithProviders(<ChoreSettingsLink />)

    expect(screen.getByRole('link', { name: /Haushalt/ })).toHaveTextContent('Haushalt · 1 Aufgabe')
  })
})
```

- [ ] **Step 10: ChoreSettingsLink implementieren**

`frontend/src/features/chores/ChoreSettingsLink.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useChores } from './useChores'

/**
 * Die Zeile in `SettingsView`, die auf die Unterseite führt. Damit entsteht das
 * Muster „Einstellungen mit Unterseiten", das die Schritte 7–9 (Belohnungen,
 * Synology-Fotos, Kiosk/Wetter) ohnehin brauchen werden.
 */
export function ChoreSettingsLink() {
  const { chores } = useChores()
  const label = chores.length === 1 ? '1 Aufgabe' : `${chores.length} Aufgaben`

  return (
    <Link
      to="/settings/chores"
      className="flex min-h-[44px] items-center justify-between rounded-2xl border border-subtle bg-surface p-4 text-primary"
    >
      <span className="text-xl font-semibold">{`Haushalt · ${label}`}</span>
      <span aria-hidden className="text-accent">→</span>
    </Link>
  )
}
```

- [ ] **Step 11: Test laufen lassen, grün bestätigen**

```bash
cd frontend && npx vitest run src/features/chores/ChoreSettingsLink.test.tsx
```

Erwartet: PASS, 2 Tests.

- [ ] **Step 12: Zeile in SettingsView einhängen**

In `frontend/src/features/settings/SettingsView.tsx` den Import ergänzen und die Zeile nach `<TaskListSection />` einsetzen:

```tsx
import { ChoreSettingsLink } from '@/features/chores/ChoreSettingsLink'
```

```tsx
          <TaskListSection />
          <ChoreSettingsLink />
```

In `frontend/src/features/settings/SettingsView.test.tsx` den Stub zu den übrigen am Dateikopf ergänzen:

```tsx
vi.mock('@/features/chores/ChoreSettingsLink', () => ({
  ChoreSettingsLink: () => <div>ChoreSettingsLink</div>,
}))
```

und den vorhandenen Test `renders the four sections and the theme toggle` umbenennen in `renders the five sections and the theme toggle` sowie um die Zeile ergänzen:

```tsx
    expect(screen.getByText('ChoreSettingsLink')).toBeInTheDocument()
```

- [ ] **Step 13: Route `/settings/chores` ergänzen**

In `frontend/src/App.tsx` den Import ergänzen und die Route **nach** `/settings` einsetzen:

```tsx
import { ChoreSettingsView } from '@/features/chores/ChoreSettingsView'
```

```tsx
        <Route
          path="/settings/chores"
          element={
            <SetupGuard>
              <AppShell>
                <ChoreSettingsView />
              </AppShell>
            </SetupGuard>
          }
        />
```

In `frontend/src/App.test.tsx` einen Route-Test nach dem Muster der vorhandenen ergänzen; erwartet wird die Überschrift „Haushaltsaufgaben".

- [ ] **Step 14: Volles Frontend-Gate**

```bash
cd frontend && npm run check
```

Erwartet: alles grün. Meldet dependency-cruiser `no-orphans` für eine der neuen Dateien, ist sie noch nirgends importiert — Einhängung in Step 12/13 nachholen.

- [ ] **Step 15: Commit**

Die drei neuen Komponenten, ihre Tests, `SettingsView.tsx`, `SettingsView.test.tsx`, `App.tsx`, `App.test.tsx` und diesen Plan committen:

```
feat(chores): add the /settings/chores admin sub-page
```

---

### Task 15: End-to-End-Abnahme und Dokumentation

**Files:**
- Create: `frontend/e2e/chores.spec.ts`
- Modify: `CLAUDE.md` — Abschnitte „Repository status", „Code layout", „Recommended build order"

**Interfaces:**
- Consumes: die fertige Anwendung; die Stub-Muster aus `frontend/e2e/tasks.spec.ts`.
- Produces: keine — dies ist die Abnahme.

---

- [ ] **Step 1: Den End-to-End-Test schreiben**

`frontend/e2e/chores.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'

type Chore = {
  id: string
  name: string
  icon: string
  description?: string | null
  intervalDays: number
  assignmentGroup: 'parents' | 'children' | 'all'
  points: number
  isActive: boolean
  nextDueOn: string
  openAssignment?: { id: string; memberId: string; memberName: string; assignedOn: string } | null
}

type Assignment = {
  id: string
  choreId: string
  memberId: string
  name: string
  icon: string
  description?: string | null
  status: 'open' | 'completed'
  points: number
  assignedOn: string
  completedAt?: string | null
}

const MEMBER = { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' }
const TODAY = '2026-09-22'

async function stubShell(page: Page) {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 7, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MEMBER]) }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  await page.route('**/api/v1/settings/verify-pin', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionToken: '11111111-1111-1111-1111-111111111111' }),
    }),
  )
}

/**
 * Bildet den Ausgabelauf nach: eine neu angelegte Vorlage bekommt sofort eine
 * offene Zuweisung beim einzigen Mitglied — genau das Verhalten, das der Sprint
 * zusichert.
 */
async function stubChores(page: Page, chores: Chore[], assignments: Assignment[]) {
  let next = 1

  await page.route(/\/api\/v1\/chores(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chores) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const id = `c${next}`
      const assignmentId = `a${next}`
      next += 1
      const created: Chore = {
        id,
        points: 10,
        isActive: true,
        nextDueOn: TODAY,
        ...body,
        openAssignment: { id: assignmentId, memberId: MEMBER.id, memberName: MEMBER.name, assignedOn: TODAY },
      }
      chores.push(created)
      assignments.push({
        id: assignmentId,
        choreId: id,
        memberId: MEMBER.id,
        name: created.name,
        icon: created.icon,
        description: created.description ?? null,
        status: 'open',
        points: created.points,
        assignedOn: TODAY,
      })
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  await page.route(/\/api\/v1\/chore-assignments$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }),
  )

  await page.route(/\/api\/v1\/chore-assignments\/([^/]+)\/(complete|undo)$/, (route) => {
    const parts = route.request().url().split('/')
    const action = parts.pop()!
    const id = parts.pop()!
    const found = assignments.find((a) => a.id === id)!
    if (action === 'complete') {
      found.status = 'completed'
      found.completedAt = new Date().toISOString()
    } else {
      found.status = 'open'
      found.completedAt = null
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
  })
}

async function enterPin(page: Page) {
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Bestätigen' }).click()
}

test('legt eine Aufgabe an und sieht sie sofort in der Lane', async ({ page }) => {
  const chores: Chore[] = []
  const assignments: Assignment[] = []
  await stubShell(page)
  await stubChores(page, chores, assignments)

  await page.goto('/settings')
  await enterPin(page)

  await page.getByRole('link', { name: /Haushalt/ }).click()
  await expect(page).toHaveURL(/\/settings\/chores$/)

  await page.getByRole('button', { name: 'Neue Aufgabe' }).click()
  await page.getByLabel('Name').fill('Tisch decken')
  await page.getByRole('button', { name: 'Symbol 🍽️' }).click()
  await page.getByRole('button', { name: 'Täglich' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Offen bei Anna · seit heute')).toBeVisible()

  await page.getByRole('link', { name: 'Haushalt' }).first().click()
  await expect(page).toHaveURL(/\/chores$/)
  await expect(page.getByText('Anna')).toBeVisible()
  await expect(page.getByText('Tisch decken')).toBeVisible()
  await expect(page.getByText('1 offen')).toBeVisible()
})

test('hakt eine Aufgabe ab und nimmt es zurueck', async ({ page }) => {
  const chores: Chore[] = []
  const assignments: Assignment[] = [
    {
      id: 'a1',
      choreId: 'c1',
      memberId: 'm1',
      name: 'Müll rausbringen',
      icon: '🗑️',
      status: 'open',
      points: 10,
      assignedOn: TODAY,
    },
  ]
  await stubShell(page)
  await stubChores(page, chores, assignments)

  await page.goto('/chores')

  await page.getByRole('button', { name: 'Müll rausbringen erledigt' }).click()
  await expect(page.getByText('Müll rausbringen')).toHaveClass(/line-through/)
  await expect(page.getByText('Alles erledigt! 🎉')).toBeVisible()

  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.getByText('1 offen')).toBeVisible()
})

test('zeigt eine leere Lane als Alles erledigt', async ({ page }) => {
  await stubShell(page)
  await stubChores(page, [], [])

  await page.goto('/chores')

  await expect(page.getByText('Alles erledigt! 🎉')).toBeVisible()
})
```

Die Beschriftung der Bestätigungsschaltfläche im `PinInputDialog` (oben als „Bestätigen" angenommen) und die Ziffern-`aria-label` in `frontend/src/features/pin/PinInputDialog.tsx` nachschlagen und hier angleichen — die E2E-Tests der anderen Bereiche geben die PIN nicht ein und liefern daher kein Muster.

- [ ] **Step 2: End-to-End-Tests laufen lassen**

```bash
cd frontend && npx playwright test e2e/chores.spec.ts
```

Erwartet: 3 Tests grün. Hängt ein Test an einem Selektor, öffne `npx playwright test e2e/chores.spec.ts --ui` und lies die tatsächliche Beschriftung ab.

- [ ] **Step 3: Gesamtes E2E-Paket laufen lassen**

```bash
cd frontend && npm run test:e2e
```

Erwartet: alle Spezifikationen grün — insbesondere `tasks.spec.ts` und `calendar.spec.ts`, die die um „Haushalt" erweiterte Navigation mitbenutzen.

- [ ] **Step 4: CLAUDE.md fortschreiben**

Drei Stellen in `CLAUDE.md`:

1. **Repository status** — „Implemented through **Sprint 5**" wird zu „Implemented through **Sprint 6** (household chores — `/chores` queue view, rotation, `/settings/chores` admin)", und „**Sprint 6 (household chores) is next.**" wird zu „**Sprint 7 (gamification: points, streaks, badges, leaderboard) is next.**"
2. **Code layout** — die Backend-Paketliste um `chores` und die Frontend-Feature-Liste um `chores` ergänzen; die Migrationsspanne `V1__…` → `V11__…` wird zu `V1__…` → `V12__…`.
3. **Recommended build order** — Punkt 6 auf `✅` setzen und die `← *current*`-Markierung auf Punkt 7 verschieben.

Ergänze außerdem unter **Gotchas** einen Eintrag:

```markdown
- **Chores sind datumslos.** `chores.next_due_on` ist der gesamte Terminzustand; es gibt keine Tagesinstanzen. Der Ausgabelauf (`ChoreRefillService`, täglich 05:00) holt alles mit `next_due_on <= heute` nach — ein mehrtägiger Ausfall verschluckt daher nichts. Ein partieller Unique-Index (`ux_chore_assignments_one_open`) garantiert, dass eine Vorlage nie zweimal gleichzeitig offen ist.
```

- [ ] **Step 5: Das vollständige Gate laufen lassen**

```bash
scripts/pre-commit-check.sh
```

Erwartet: „✓ Alle Prüfungen bestanden". Das ist die Bedingung aus der Definition of Done.

- [ ] **Step 6: Die Definition of Done Punkt für Punkt gegen die laufende Anwendung prüfen**

Backend und Frontend starten (`cd backend && ./gradlew bootRun`, in einem zweiten Terminal `cd frontend && npm run dev`) und abhaken:

1. Eine Ämtli-Vorlage ist unter `/settings/chores` anlegbar und erscheint **sofort** in der Lane des zugewiesenen Mitglieds.
2. Die Verwaltungsseite zeigt je Vorlage, bei wem sie liegt bzw. wann sie wieder fällig wird — und warum sie wartet, falls sie es tut.
3. `/chores` ist über die Bereichsnavigation erreichbar und zeigt je aktivem Mitglied eine Spalte mit höchstens fünf offenen Aufgaben, mit großem Emoji.
4. Abhaken und Rückgängigmachen funktionieren per Fingertipp, inklusive sichtbarer Fehlermeldung (Netzwerk in den DevTools kappen und erneut abhaken).
5. Nach einer Erledigung taucht die Aufgabe erst nach Ablauf ihres Intervalls wieder auf — bei der **nächsten** Person der Rotation. (Mit einer täglichen Aufgabe und zwei Mitgliedern prüfbar: erledigen, in der DB `next_due_on` auf gestern setzen, Anwendung neu starten, der Startlauf gibt sie an die zweite Person aus.)
6. Ein mehrtägiger Ausfall verschluckt keine Aufgabe (`next_due_on` mehrere Tage in die Vergangenheit setzen, Anwendung neu starten: alles Fällige kommt heraus).
7. Eine leere Liste zeigt „Alles erledigt!".
8. `scripts/pre-commit-check.sh` ist grün.

Was hier auffällt, wird behoben, bevor der letzte Commit fällt — nicht als „bekannte Einschränkung" notiert.

- [ ] **Step 7: Abschluss-Commit**

`frontend/e2e/chores.spec.ts`, `CLAUDE.md` und diesen Plan committen:

```
test(chores): add end-to-end coverage and update project docs
```

---

## Nach dem Plan

Die Arbeit steckt auf einem eigenen Branch. Zum Integrieren die Sub-Skill `superpowers:finishing-a-development-branch` verwenden — sie entscheidet zwischen Merge, Pull Request und Verwerfen.

Ausdrücklich **nicht** Teil dieses Plans und bewusst offen (siehe Spec, Abschnitt „Umfang"):

- Punkte-Konten, Streaks, Abzeichen und Rangliste — Schritt 7. Das Feld `points` wird bereits geführt und bei der Ausgabe eingefroren, damit Schritt 7 eine korrekte Historie vorfindet.
- Überspringen (FA-HH-37) und Umzuweisen (FA-HH-38). Daraus folgt die im Spec festgehaltene Lücke: Fährt jemand mit einer offenen Aufgabe in den Urlaub, ohne deaktiviert zu werden, bleibt diese Vorlage liegen, bis er zurück ist.
- Elternfreigabe (FA-HH-33), Abwesenheiten (FA-ROT-06), Last-Ausgleich und Zufallsverteilung (FA-ROT-09/-10), fester Wochentag (FA-HH-09), Vorschau (FA-HH-13), Notiz zur Erledigung (FA-HH-39).
