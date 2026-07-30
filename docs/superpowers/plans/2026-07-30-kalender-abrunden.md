# Kalender abrunden — Agenda, Erinnerungen, Serientermine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the FamilyHub calendar with an agenda list view, per-event reminders, and recurring events (create + series/instance-scoped edit & delete).

**Architecture:** Three independently shippable increments. Increment 1 (Agenda) is frontend-only, no contract change. Increments 2 (Reminders) and 3 (Recurrence) are contract-first: edit `api/openapi.yml` → regenerate backend interfaces (`openApiGenerate`) and frontend client (`orval`) → implement backend → implement frontend. Recurrence relies on Google expanding series into instances (`singleEvents=true`); series edit/delete operate on the Google parent via the already-stored `recurringEventId`, and the local mirror reconciles on the next sync.

**Tech Stack:** Backend Kotlin 2.0.21 / Spring Boot 3.3.5 (Java 21), Flyway, Google Calendar Java client. Frontend React 18 / TypeScript / Vite, TanStack Query, `date-fns` (`de` locale), orval-generated client, vitest + Playwright.

## Global Constraints

- **Contract-first:** never hand-edit generated code. Change `api/openapi.yml`, then run `./gradlew openApiGenerate` (backend) and `npm run generate:api` (frontend). — verbatim from CLAUDE.md.
- **Additive contract only:** new fields are nullable / have defaults; new `scope` query param is optional with default `instance`. No `breaking-change` label needed (oasdiff must stay green).
- **Flyway:** never edit an applied migration; add a new `V{n}__…` file. Current latest is `V8`; the next is `V9`.
- **Backend needs Java 21**; backend tests need Docker (Testcontainers). Run `bash -l -c "cd backend && ./gradlew …"` if `JAVA_HOME` is wrong.
- **German UI throughout**, touch targets ≥ 44×44 px, no hover-only interactions.
- **Definition of done per increment:** reachable through the UI, tests green, CI green (`scripts/pre-commit-check.sh`).
- **PIN/security:** these endpoints already use `security: []` in the spec — keep it.

---

## File Structure

**Increment 1 — Agenda (frontend only)**
- Modify `frontend/src/features/calendar/dates.ts` — add `'agenda'` mode + `agendaRange` helper.
- Modify `frontend/src/features/calendar/CalendarHeader.tsx` — agenda toggle button; hide prev/next in agenda.
- Create `frontend/src/features/calendar/AgendaList.tsx` — grouped upcoming-events list.
- Create `frontend/src/features/calendar/AgendaList.test.tsx`.
- Modify `frontend/src/features/calendar/CalendarView.tsx` — range selection + render `AgendaList`.

**Increment 2 — Reminders (contract + backend + frontend)**
- Modify `api/openapi.yml` — reminder fields on `EventCreateRequest` + `EventResponse`.
- Create `backend/src/main/resources/db/migration/V9__event_reminders.sql`.
- Modify `backend/src/main/kotlin/com/familyhub/google/calendar/Event.kt`, `EventMapper.kt`, `EventService.kt`, `EventController.kt`, `CalendarSyncService.kt`.
- Create `frontend/src/features/calendar/reminders.ts` (+ `reminders.test.ts`) — preset ↔ (useDefault, minutes) mapping.
- Modify `frontend/src/features/calendar/EventDialog.tsx`, `useCalendarEvents.ts` (`CalendarEvent` type).

**Increment 3 — Recurrence (contract + backend + frontend)**
- Modify `api/openapi.yml` — `recurrenceRule` on request; `recurringEventId` + `recurrenceRule` on response; `scope` param on PUT/DELETE; new `GET /v1/events/{id}/series`.
- Modify backend `GoogleCalendarClient.kt` (add `getEvent`), `EventMapper.kt`, `EventService.kt`, `EventController.kt`.
- Create `frontend/src/features/calendar/recurrence.ts` (+ `recurrence.test.ts`) — RRULE build/parse.
- Create `frontend/src/features/calendar/RecurrenceFields.tsx` (+ test) — create-mode recurrence UI.
- Modify `frontend/src/features/calendar/EventDialog.tsx` (recurrence section + series scope), `EventBlock.tsx`, `AgendaList.tsx` (badge), `useCalendarEvents.ts` (`recurringEventId` on type + scope-aware mutations).
- Modify `frontend/e2e/calendar.spec.ts` — series create → badge → delete-series flow.

---

# Increment 1 — Agenda-/Listenansicht (`FA-KAL-21`)

### Task 1: Agenda mode + range helper in `dates.ts`

**Files:**
- Modify: `frontend/src/features/calendar/dates.ts`
- Test: `frontend/src/features/calendar/dates.test.ts`

**Interfaces:**
- Produces: `CalendarViewMode = 'week' | 'day' | 'agenda'`; `agendaRange(today: Date, days?: number): VisibleRange` (default 30 days, from `startOfDay(today)` to `endOfDay(today + days)`).

- [ ] **Step 1: Write the failing test** — append to `dates.test.ts`:

```ts
import { agendaRange } from './dates'

describe('agendaRange', () => {
  it('spans from start of today through end of today + 30 days', () => {
    const today = new Date('2026-07-30T14:00:00Z')
    const { start, end } = agendaRange(today)
    expect(start.toISOString()).toBe(new Date('2026-07-30T00:00:00').toISOString())
    // 30 days later, end of day
    expect(end.getDate()).toBe(new Date('2026-08-29T00:00:00').getDate())
    expect(end.getHours()).toBe(23)
  })

  it('honours a custom window length', () => {
    const { start, end } = agendaRange(new Date('2026-07-30T00:00:00'), 6)
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    expect(spanDays).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/dates.test.ts`
Expected: FAIL — `agendaRange is not a function`.

- [ ] **Step 3: Implement** — in `dates.ts` change the type and add the helper:

```ts
export type CalendarViewMode = 'week' | 'day' | 'agenda'
```

```ts
export function agendaRange(today: Date, days = 30): VisibleRange {
  return { start: startOfDay(today), end: endOfDay(addDays(today, days)) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/calendar/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/dates.ts frontend/src/features/calendar/dates.test.ts
git commit -m "feat(calendar): add agenda view mode and 30-day range helper"
```

---

### Task 2: Agenda toggle + conditional nav in `CalendarHeader`

**Files:**
- Modify: `frontend/src/features/calendar/CalendarHeader.tsx`
- Test: `frontend/src/features/calendar/CalendarHeader.test.tsx`

**Interfaces:**
- Consumes: `CalendarViewMode` (now includes `'agenda'`).
- Produces: header renders a third toggle button labelled `Agenda`; when `view === 'agenda'`, the prev/next buttons are not rendered.

- [ ] **Step 1: Write the failing test** — append to `CalendarHeader.test.tsx` (follow the existing render/setup in that file):

```ts
it('shows an Agenda toggle and hides prev/next in agenda mode', () => {
  render(
    <CalendarHeader
      label="Juli 2026" view="agenda"
      onViewChange={() => {}} onPrev={() => {}} onNext={() => {}}
      onToday={() => {}} onSync={() => {}} isSyncing={false} onOpenSettings={() => {}}
    />,
  )
  expect(screen.getByRole('button', { name: 'Agenda' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Vorheriger Zeitraum' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Nächster Zeitraum' })).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/CalendarHeader.test.tsx`
Expected: FAIL — no `Agenda` button; prev/next still present.

- [ ] **Step 3: Implement** — in `CalendarHeader.tsx`:

Extend the toggle list and label:

```tsx
{(['day', 'week', 'agenda'] as CalendarViewMode[]).map((v) => (
  <button
    key={v}
    type="button"
    aria-pressed={view === v}
    onClick={() => onViewChange(v)}
    className={`px-4 py-3 min-h-[44px] text-white ${view === v ? 'bg-blue-500' : 'bg-slate-700'}`}
  >
    {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Agenda'}
  </button>
))}
```

Wrap the prev/next buttons so they only render outside agenda mode:

```tsx
{view !== 'agenda' && (
  <>
    <button type="button" aria-label="Vorheriger Zeitraum" onClick={onPrev} className={BTN}>
      <ChevronLeft aria-hidden />
    </button>
    <button type="button" onClick={onToday} className={BTN}>Heute</button>
    <button type="button" aria-label="Nächster Zeitraum" onClick={onNext} className={BTN}>
      <ChevronRight aria-hidden />
    </button>
  </>
)}
{view === 'agenda' && (
  <button type="button" onClick={onToday} className={BTN}>Heute</button>
)}
```

- [ ] **Step 4: Run tests to verify they pass** (also re-run existing header tests)

Run: `cd frontend && npx vitest run src/features/calendar/CalendarHeader.test.tsx`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/CalendarHeader.tsx frontend/src/features/calendar/CalendarHeader.test.tsx
git commit -m "feat(calendar): add Agenda toggle, hide paging in agenda mode"
```

---

### Task 3: `AgendaList` component

**Files:**
- Create: `frontend/src/features/calendar/AgendaList.tsx`
- Test: `frontend/src/features/calendar/AgendaList.test.tsx`

**Interfaces:**
- Consumes: the same grid props object used by `WeekGrid`/`DayGrid`: `{ anchor: Date; events: CalendarEvent[]; members: MemberResponse[]; now: Date; onEventClick: (e: CalendarEvent) => void; onSlotClick: (d: Date) => void }`. `AgendaList` uses `events`, `members`, `now`, `onEventClick` (it ignores `anchor`/`onSlotClick`).
- Produces: `export function AgendaList(props): JSX.Element`. Groups events by day (skipping empty days) over the window implied by the loaded `events`, one header per day, one row per event; row click calls `onEventClick`.

Helper rules (implement inline, keep pure where practical):
- A timed event belongs to the day of `event.start`.
- An all-day event belongs to every day `d` where `allDaySpansDay(event.allDayStart, event.allDayEnd, d)` is true (reuse the existing `allDaySpansDay` from `dates.ts`).
- Determine the set of candidate days from `now` (start of day) forward for 31 days (0..30 inclusive); render only days that have ≥1 event.
- Member colour: `members.find(m => m.id === event.memberId)?.color` (fall back to `#64748b`). Confirm the member colour property name against `MemberResponse` in `@/api/generated/model`; the grids already resolve it — mirror their lookup exactly.

- [ ] **Step 1: Write the failing test** — `AgendaList.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { AgendaList } from './AgendaList'
import type { CalendarEvent } from './useCalendarEvents'

const now = new Date('2026-07-30T09:00:00')
const members = [{ id: 'm1', name: 'Anna', color: '#ff0000' }] as never

function timed(id: string, iso: string): CalendarEvent {
  return {
    id, title: `E-${id}`, memberId: 'm1', isAllDay: false,
    start: new Date(iso), end: new Date(iso), allDayStart: null, allDayEnd: null,
    location: null, description: null,
  }
}

const base = { anchor: now, members, now, onSlotClick: () => {} }

it('groups events by day and skips empty days', () => {
  const events = [timed('a', '2026-07-30T10:00:00'), timed('b', '2026-08-01T08:00:00')]
  render(<AgendaList {...base} events={events} onEventClick={() => {}} />)
  expect(screen.getByText('E-a')).toBeInTheDocument()
  expect(screen.getByText('E-b')).toBeInTheDocument()
  // 31 has no events → no header containing '31'
  expect(screen.queryByText(/31\./)).toBeNull()
})

it('shows an empty state when there are no events', () => {
  render(<AgendaList {...base} events={[]} onEventClick={() => {}} />)
  expect(screen.getByText('Keine Termine in den nächsten 30 Tagen.')).toBeInTheDocument()
})

it('calls onEventClick when a row is tapped', () => {
  const onEventClick = vi.fn()
  render(<AgendaList {...base} events={[timed('a', '2026-07-30T10:00:00')]} onEventClick={onEventClick} />)
  fireEvent.click(screen.getByText('E-a'))
  expect(onEventClick).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/AgendaList.test.tsx`
Expected: FAIL — `AgendaList` not found.

- [ ] **Step 3: Implement `AgendaList.tsx`:**

```tsx
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { de } from 'date-fns/locale'
import type { MemberResponse } from '@/api/generated/model'
import type { CalendarEvent } from './useCalendarEvents'
import { allDaySpansDay, formatTime } from './dates'

interface AgendaListProps {
  anchor: Date
  events: CalendarEvent[]
  members: MemberResponse[]
  now: Date
  onEventClick: (e: CalendarEvent) => void
  onSlotClick: (d: Date) => void
}

const FALLBACK_COLOR = '#64748b'

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((e) =>
      e.isAllDay
        ? e.allDayStart != null && allDaySpansDay(e.allDayStart, e.allDayEnd, day)
        : e.start != null && isSameDay(e.start, day),
    )
    .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))
}

export function AgendaList({ events, members, now, onEventClick }: AgendaListProps) {
  const first = startOfDay(now)
  const days = Array.from({ length: 31 }, (_, i) => addDays(first, i))
  const grouped = days
    .map((day) => ({ day, dayEvents: eventsForDay(events, day) }))
    .filter((g) => g.dayEvents.length > 0)

  if (grouped.length === 0) {
    return <p className="px-4 py-8 text-slate-400">Keine Termine in den nächsten 30 Tagen.</p>
  }

  return (
    <div className="flex flex-col gap-4 px-2">
      {grouped.map(({ day, dayEvents }) => (
        <section key={day.toISOString()}>
          <h2
            className={`px-2 py-2 text-lg font-bold ${
              isSameDay(day, now) ? 'text-blue-400' : 'text-slate-300'
            }`}
          >
            {format(day, 'EEEE, d. MMMM', { locale: de })}
          </h2>
          <ul className="flex flex-col gap-2">
            {dayEvents.map((e) => {
              const color = members.find((m) => m.id === e.memberId)?.color ?? FALLBACK_COLOR
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onEventClick(e)}
                    className="flex w-full items-center gap-3 rounded-xl bg-slate-800 px-3 py-3 min-h-[44px] text-left"
                  >
                    <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="w-28 shrink-0 text-slate-300">
                      {e.isAllDay ? 'Ganztägig' : e.start ? formatTime(e.start) : ''}
                    </span>
                    <span className="truncate font-medium text-white">{e.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/calendar/AgendaList.test.tsx`
Expected: PASS. (If the member colour property is not `color`, align the lookup with `WeekGrid`/`DayGrid` and update the test's member fixture.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/AgendaList.tsx frontend/src/features/calendar/AgendaList.test.tsx
git commit -m "feat(calendar): add AgendaList grouped upcoming-events view"
```

---

### Task 4: Wire agenda into `CalendarView`

**Files:**
- Modify: `frontend/src/features/calendar/CalendarView.tsx`
- Modify: `frontend/src/features/calendar/useCalendarEvents.ts` (only if a dedicated agenda range hook is cleaner — see below)

**Interfaces:**
- Consumes: `agendaRange` (Task 1), `AgendaList` (Task 3).
- Produces: when `view === 'agenda'`, events are loaded for the 30-day agenda window and `AgendaList` is rendered.

The current `useCalendarEvents(anchor, view)` computes its range via `visibleRange(anchor, view)`, which only handles `'day'`/`'week'`. Make it agenda-aware.

- [ ] **Step 1: Update the range computation** — in `useCalendarEvents.ts`, replace the range line so agenda uses `agendaRange(anchor)`:

```ts
import { visibleRange, agendaRange, rangeParams, type CalendarViewMode } from './dates'
// ...
export function useCalendarEvents(anchor: Date, view: CalendarViewMode) {
  const range = view === 'agenda' ? agendaRange(anchor) : visibleRange(anchor, view)
  const params = rangeParams(range)
  const query = useListEvents(params)
  // ...unchanged
}
```

- [ ] **Step 2: Render `AgendaList` in `CalendarView`** — add the import and the branch:

```tsx
import { AgendaList } from './AgendaList'
// ...
<div className="overflow-y-auto px-2 pb-4">
  {view === 'week' && <WeekGrid {...gridProps} />}
  {view === 'day' && <DayGrid {...gridProps} />}
  {view === 'agenda' && <AgendaList {...gridProps} />}
</div>
```

Note: in agenda mode the header hides prev/next (Task 2); `onToday` should reset `anchor` to `new Date()` — the existing `onToday={() => setAnchor(new Date())}` already does this. The `periodLabel(anchor)` still shows month/year, which is fine as a heading.

- [ ] **Step 3: Add a focused view test** — append to `CalendarView.test.tsx` (mirror the existing test setup/mocks in that file):

```tsx
it('renders the agenda list when the agenda view is selected', async () => {
  renderCalendarView() // existing helper in this file
  fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))
  expect(await screen.findByRole('button', { name: 'Agenda', pressed: true })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the calendar tests + full check**

Run: `cd frontend && npx vitest run src/features/calendar/ && npm run check`
Expected: PASS; `tsc`, eslint, dependency-cruiser, coverage all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/CalendarView.tsx frontend/src/features/calendar/useCalendarEvents.ts frontend/src/features/calendar/CalendarView.test.tsx
git commit -m "feat(calendar): wire AgendaList into CalendarView (FA-KAL-21)"
```

**Increment 1 done:** Agenda reachable via the header toggle, tests green.

---

# Increment 2 — Erinnerungen (`FA-KAL-23`)

### Task 5: Contract — reminder fields + regenerate

**Files:**
- Modify: `api/openapi.yml` (schemas `EventCreateRequest` ~L970, `EventResponse` ~L1005)

**Interfaces:**
- Produces: generated `EventCreateRequest` and `EventResponse` (both TS and Kotlin) gain `reminderUseDefault: boolean` and `reminderMinutes: number | null`.

- [ ] **Step 1: Edit `api/openapi.yml`** — add to the `properties:` of **both** `EventCreateRequest` and `EventResponse`:

```yaml
        reminderUseDefault:
          type: boolean
          default: true
        reminderMinutes:
          type: integer
          nullable: true
```

Do **not** add them to any `required:` list.

- [ ] **Step 2: Regenerate both clients**

Run: `bash -l -c "cd backend && ./gradlew openApiGenerate"` and `cd frontend && npm run generate:api`
Expected: `frontend/src/api/generated/model/eventCreateRequest.ts` and `eventResponse.ts` now include the two fields; backend generated model under `build/generated` updates.

- [ ] **Step 3: Verify oasdiff is not broken** (additive change)

Run: `bash -l -c "cd backend && ./gradlew openApiGenerate"` (compiles the spec); the CI oasdiff step treats added optional fields as non-breaking — no `breaking-change` label needed.

- [ ] **Step 4: Commit**

```bash
git add api/openapi.yml frontend/src/api/generated
git commit -m "feat(api): add reminderUseDefault/reminderMinutes to event schemas"
```

---

### Task 6: Migration V9 + entity fields

**Files:**
- Create: `backend/src/main/resources/db/migration/V9__event_reminders.sql`
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/Event.kt`

**Interfaces:**
- Produces: `Event.reminderUseDefault: Boolean` (default `true`), `Event.reminderMinutes: Int?`.

- [ ] **Step 1: Create the migration** — `V9__event_reminders.sql`:

```sql
ALTER TABLE events
    ADD COLUMN reminder_use_default BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN reminder_minutes INTEGER;
```

- [ ] **Step 2: Add entity columns** — in `Event.kt`, add to the constructor (after `recurrenceId`):

```kotlin
    @Column(name = "reminder_use_default", nullable = false)
    var reminderUseDefault: Boolean = true,
    @Column(name = "reminder_minutes")
    var reminderMinutes: Int? = null,
```

- [ ] **Step 3: Compile to verify Flyway + entity align**

Run: `bash -l -c "cd backend && ./gradlew compileKotlin"`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V9__event_reminders.sql backend/src/main/kotlin/com/familyhub/google/calendar/Event.kt
git commit -m "feat(calendar): persist per-event reminder settings (V9)"
```

---

### Task 7: Backend reminder write + read + response

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventMapper.kt`
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt` (`CreateEventCommand`, `EventView`, `toEventCommand`, `toView`)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventController.kt` (`toCommand`, `toResponse`)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/CalendarSyncService.kt` (copy fields on the "existing" update branch)
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt`

**Interfaces:**
- Consumes: `EventCreateRequest.reminderUseDefault`, `EventCreateRequest.reminderMinutes` (Task 5); entity fields (Task 6).
- Produces: `EventCommand` + `CreateEventCommand` gain `reminderUseDefault: Boolean = true`, `reminderMinutes: Int? = null`; `EventView` gains both; `EventMapper.toGoogleEvent` writes Google `reminders`; `EventMapper.toEntity` reads them back.

Google mapping (`com.google.api.services.calendar.model.Event.Reminders`, `EventReminder`):
- `useDefault=true` → `Reminders().setUseDefault(true)`.
- else → `Reminders().setUseDefault(false).setOverrides(minutes?.let { listOf(EventReminder().setMethod("popup").setMinutes(it)) } ?: emptyList())`.
- Read back: `google.reminders?.useDefault == true` → (`true`, `null`); else `useDefault=false` and `reminderMinutes` = first override with `method == "popup"` → its `minutes`, else `null`.

- [ ] **Step 1: Write the failing mapper test** — append to `EventMapperTest.kt`:

```kotlin
@Test
fun `toGoogleEvent sets popup reminder override when not using default`() {
    val cmd = EventCommand(
        title = "Zahnarzt", isAllDay = false,
        start = Instant.parse("2026-07-31T09:00:00Z"),
        end = Instant.parse("2026-07-31T10:00:00Z"),
        reminderUseDefault = false, reminderMinutes = 30,
    )
    val g = EventMapper().toGoogleEvent(cmd)
    assertThat(g.reminders.useDefault).isFalse()
    assertThat(g.reminders.overrides).hasSize(1)
    assertThat(g.reminders.overrides[0].method).isEqualTo("popup")
    assertThat(g.reminders.overrides[0].minutes).isEqualTo(30)
}

@Test
fun `toEntity reads popup reminder minutes back`() {
    val g = com.google.api.services.calendar.model.Event()
        .setId("g1").setSummary("Zahnarzt")
        .setStart(com.google.api.services.calendar.model.EventDateTime()
            .setDateTime(com.google.api.client.util.DateTime(Instant.parse("2026-07-31T09:00:00Z").toEpochMilli())))
        .setEnd(com.google.api.services.calendar.model.EventDateTime()
            .setDateTime(com.google.api.client.util.DateTime(Instant.parse("2026-07-31T10:00:00Z").toEpochMilli())))
        .setReminders(com.google.api.services.calendar.model.Event.Reminders()
            .setUseDefault(false)
            .setOverrides(listOf(com.google.api.services.calendar.model.EventReminder().setMethod("popup").setMinutes(30))))
    val entity = EventMapper().toEntity(g, testSubscription, testMemberId) // reuse fixtures already in this test file
    assertThat(entity.reminderUseDefault).isFalse()
    assertThat(entity.reminderMinutes).isEqualTo(30)
}
```

(Use the fixture names already present in `EventMapperTest.kt` for `testSubscription`/`testMemberId`; if they differ, match the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventMapperTest*'"`
Expected: FAIL — compile error (fields missing) or assertion failure.

- [ ] **Step 3: Implement.**

In `EventMapper.kt` — add fields to `EventCommand`:

```kotlin
    val isAllDay: Boolean,
    val reminderUseDefault: Boolean = true,
    val reminderMinutes: Int? = null,
```

In `toGoogleEvent`, before `return googleEvent` add:

```kotlin
        googleEvent.reminders =
            if (cmd.reminderUseDefault) {
                GoogleEvent.Reminders().setUseDefault(true)
            } else {
                GoogleEvent.Reminders().setUseDefault(false).setOverrides(
                    cmd.reminderMinutes?.let {
                        listOf(EventReminder().setMethod("popup").setMinutes(it))
                    } ?: emptyList(),
                )
            }
```

Add the import `import com.google.api.services.calendar.model.EventReminder`.

In `toEntity`, compute reminders and pass them to the `Event(...)`:

```kotlin
        val reminderUseDefault = google.reminders?.useDefault ?: true
        val reminderMinutes =
            google.reminders?.overrides?.firstOrNull { it.method == "popup" }?.minutes
```

and add to the `Event(...)` constructor call:

```kotlin
            reminderUseDefault = reminderUseDefault,
            reminderMinutes = reminderMinutes,
```

In `EventService.kt` — add to `CreateEventCommand`, to `EventView`, and to `toEventCommand`/`toView`:

```kotlin
// CreateEventCommand:
    val isAllDay: Boolean,
    val reminderUseDefault: Boolean = true,
    val reminderMinutes: Int? = null,
```
```kotlin
// EventView:
    val calendarId: String,
    val reminderUseDefault: Boolean,
    val reminderMinutes: Int?,
```
```kotlin
// CreateEventCommand.toEventCommand():
        isAllDay = isAllDay,
        reminderUseDefault = reminderUseDefault,
        reminderMinutes = reminderMinutes,
```
```kotlin
// Event.toView():
        calendarId = googleCalendarId,
        reminderUseDefault = reminderUseDefault,
        reminderMinutes = reminderMinutes,
```

In `EventController.kt` — `EventCreateRequest.toCommand()` add:

```kotlin
        isAllDay = isAllDay,
        reminderUseDefault = reminderUseDefault ?: true,
        reminderMinutes = reminderMinutes,
```
and `EventView.toResponse()` add:

```kotlin
        calendarId = calendarId,
        reminderUseDefault = reminderUseDefault,
        reminderMinutes = reminderMinutes,
```

In `CalendarSyncService.kt` — on the "existing" branch (after `existing.recurrenceId = mapped.recurrenceId`) add:

```kotlin
                    existing.reminderUseDefault = mapped.reminderUseDefault
                    existing.reminderMinutes = mapped.reminderMinutes
```

- [ ] **Step 4: Run tests**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventMapperTest*' --tests '*EventServiceTest*' --tests '*EventControllerTest*'"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt
git commit -m "feat(calendar): map per-event reminders to/from Google (FA-KAL-23)"
```

---

### Task 8: Frontend reminder mapping + dialog control

**Files:**
- Create: `frontend/src/features/calendar/reminders.ts`
- Test: `frontend/src/features/calendar/reminders.test.ts`
- Modify: `frontend/src/features/calendar/EventDialog.tsx`
- Modify: `frontend/src/features/calendar/useCalendarEvents.ts` (`CalendarEvent` gains reminder fields)

**Interfaces:**
- Produces: `reminders.ts` exporting
  - `type ReminderPreset = 'default' | 'none' | '10m' | '30m' | '1h' | '1d'`
  - `REMINDER_OPTIONS: { value: ReminderPreset; label: string }[]`
  - `presetToApi(p: ReminderPreset): { reminderUseDefault: boolean; reminderMinutes: number | null }`
  - `apiToPreset(useDefault: boolean, minutes: number | null): ReminderPreset`

- [ ] **Step 1: Write the failing test** — `reminders.test.ts`:

```ts
import { presetToApi, apiToPreset } from './reminders'

it('maps presets to API fields', () => {
  expect(presetToApi('default')).toEqual({ reminderUseDefault: true, reminderMinutes: null })
  expect(presetToApi('none')).toEqual({ reminderUseDefault: false, reminderMinutes: null })
  expect(presetToApi('30m')).toEqual({ reminderUseDefault: false, reminderMinutes: 30 })
  expect(presetToApi('1d')).toEqual({ reminderUseDefault: false, reminderMinutes: 1440 })
})

it('maps API fields back to the nearest preset', () => {
  expect(apiToPreset(true, null)).toBe('default')
  expect(apiToPreset(false, null)).toBe('none')
  expect(apiToPreset(false, 60)).toBe('1h')
  expect(apiToPreset(false, 999)).toBe('none') // unknown minutes → none
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/calendar/reminders.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reminders.ts`:**

```ts
export type ReminderPreset = 'default' | 'none' | '10m' | '30m' | '1h' | '1d'

const MINUTES: Record<Exclude<ReminderPreset, 'default' | 'none'>, number> = {
  '10m': 10, '30m': 30, '1h': 60, '1d': 1440,
}

export const REMINDER_OPTIONS: { value: ReminderPreset; label: string }[] = [
  { value: 'default', label: 'Standard des Kalenders' },
  { value: 'none', label: 'Keine' },
  { value: '10m', label: '10 Minuten vorher' },
  { value: '30m', label: '30 Minuten vorher' },
  { value: '1h', label: '1 Stunde vorher' },
  { value: '1d', label: '1 Tag vorher' },
]

export function presetToApi(p: ReminderPreset): { reminderUseDefault: boolean; reminderMinutes: number | null } {
  if (p === 'default') return { reminderUseDefault: true, reminderMinutes: null }
  if (p === 'none') return { reminderUseDefault: false, reminderMinutes: null }
  return { reminderUseDefault: false, reminderMinutes: MINUTES[p] }
}

export function apiToPreset(useDefault: boolean, minutes: number | null): ReminderPreset {
  if (useDefault) return 'default'
  if (minutes == null) return 'none'
  const match = (Object.keys(MINUTES) as (keyof typeof MINUTES)[]).find((k) => MINUTES[k] === minutes)
  return match ?? 'none'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/calendar/reminders.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `CalendarEvent`** — in `useCalendarEvents.ts` add to the interface and to `toCalendarEvent`:

```ts
  // interface CalendarEvent:
  reminderUseDefault: boolean
  reminderMinutes: number | null
```
```ts
  // toCalendarEvent return:
    reminderUseDefault: e.reminderUseDefault ?? true,
    reminderMinutes: e.reminderMinutes ?? null,
```

- [ ] **Step 6: Add the reminder dropdown to `EventDialog.tsx`** — state, submit payload, and control:

State (near the other `useState`s):

```tsx
import { REMINDER_OPTIONS, presetToApi, apiToPreset, type ReminderPreset } from './reminders'
// ...
const [reminder, setReminder] = useState<ReminderPreset>(
  initial ? apiToPreset(initial.reminderUseDefault, initial.reminderMinutes) : 'default',
)
```

Merge into the `data` payload (spread into both branches of the existing `EventCreateRequest`):

```tsx
const reminderFields = presetToApi(reminder)
const data: EventCreateRequest = isAllDay
  ? { /* existing all-day fields */, ...reminderFields }
  : { /* existing timed fields */, ...reminderFields }
```

Control (place after the Ort/Beschreibung fields, before `{error && …}`):

```tsx
<label className="flex flex-col gap-1 text-white">
  Erinnerung
  <select
    aria-label="Erinnerung"
    className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
    value={reminder}
    onChange={(e) => setReminder(e.target.value as ReminderPreset)}
  >
    {REMINDER_OPTIONS.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
</label>
```

- [ ] **Step 7: Add a dialog test** — append to `EventDialog.test.tsx` (mirror existing setup/mocks): selecting "30 Minuten vorher" and saving sends `reminderUseDefault:false, reminderMinutes:30`; opening an event created with those values pre-selects "30 Minuten vorher". Assert against the mocked create mutation's argument.

- [ ] **Step 8: Run frontend check**

Run: `cd frontend && npx vitest run src/features/calendar/ && npm run check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/calendar/reminders.ts frontend/src/features/calendar/reminders.test.ts frontend/src/features/calendar/EventDialog.tsx frontend/src/features/calendar/EventDialog.test.tsx frontend/src/features/calendar/useCalendarEvents.ts
git commit -m "feat(calendar): reminder dropdown in event dialog (FA-KAL-23)"
```

**Increment 2 done:** reminders reachable in the dialog, round-trip to Google, tests green.

---

# Increment 3 — Serientermine (`FA-KAL-22`, Variante B)

### Task 9: Contract — recurrence fields, scope param, series endpoint

**Files:**
- Modify: `api/openapi.yml`

**Interfaces:**
- Produces: `EventCreateRequest.recurrenceRule: string | null`; `EventResponse.recurringEventId: string | null` + `EventResponse.recurrenceRule: string | null`; `scope` query param (`enum [instance, series]`, default `instance`) on `updateEvent` + `deleteEvent`; new operation `getEventSeries` at `GET /v1/events/{id}/series` returning `EventResponse`.

- [ ] **Step 1: Add request/response fields.** In `EventCreateRequest.properties` add:

```yaml
        recurrenceRule:
          type: string
          nullable: true
```

In `EventResponse.properties` add:

```yaml
        recurringEventId:
          type: string
          nullable: true
        recurrenceRule:
          type: string
          nullable: true
```

- [ ] **Step 2: Add the `scope` query param** to both the `put` and `delete` under `/v1/events/{id}` — add to each operation's `parameters:` list:

```yaml
        - name: scope
          in: query
          required: false
          schema:
            type: string
            enum: [instance, series]
            default: instance
```

- [ ] **Step 3: Add the series endpoint.** After the `/v1/events/{id}` path block, add:

```yaml
  /v1/events/{id}/series:
    get:
      operationId: getEventSeries
      summary: Get the parent series (with recurrence rule) of a recurring event instance
      tags: [Events]
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
          description: Parent series event
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/EventResponse"
```

- [ ] **Step 4: Regenerate**

Run: `bash -l -c "cd backend && ./gradlew openApiGenerate"` and `cd frontend && npm run generate:api`
Expected: backend `EventsApi` gains `updateEvent(..., scope)`, `deleteEvent(..., scope)`, `getEventSeries(id)`; frontend generates `getEventSeries` fetcher + `useGetEventSeries` and `UpdateEventParams`/`DeleteEventParams` types with `scope`.

- [ ] **Step 5: Commit**

```bash
git add api/openapi.yml frontend/src/api/generated
git commit -m "feat(api): recurrence fields, series scope param, series endpoint"
```

---

### Task 10: Backend — recurrence on create + response

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventMapper.kt` (write `recurrence`, read nothing new — `recurrenceId` already read)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt` (`CreateEventCommand.recurrenceRule`, `EventView.recurringEventId`, `toEventCommand`, `toView`)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventController.kt` (`toCommand`, `toResponse`)
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt`

**Interfaces:**
- Consumes: contract fields (Task 9).
- Produces: `EventCommand.recurrenceRule: String? = null`; `toGoogleEvent` sets `recurrence`; `CreateEventCommand.recurrenceRule`; `EventView.recurringEventId: String?`; response carries `recurringEventId` (from entity `recurrenceId`) and `recurrenceRule = null` on normal responses.

- [ ] **Step 1: Failing mapper test** — append to `EventMapperTest.kt`:

```kotlin
@Test
fun `toGoogleEvent sets recurrence when a rule is present`() {
    val cmd = EventCommand(
        title = "Sport", isAllDay = false,
        start = Instant.parse("2026-07-31T18:00:00Z"),
        end = Instant.parse("2026-07-31T19:00:00Z"),
        recurrenceRule = "RRULE:FREQ=WEEKLY;BYDAY=FR",
    )
    val g = EventMapper().toGoogleEvent(cmd)
    assertThat(g.recurrence).containsExactly("RRULE:FREQ=WEEKLY;BYDAY=FR")
}
```

- [ ] **Step 2: Run to verify fail**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventMapperTest*'"`
Expected: FAIL (field/`recurrence` missing).

- [ ] **Step 3: Implement.**

`EventMapper.kt` — add to `EventCommand`:

```kotlin
    val reminderMinutes: Int? = null,
    val recurrenceRule: String? = null,
```

In `toGoogleEvent`, after setting reminders:

```kotlin
        if (cmd.recurrenceRule != null) {
            googleEvent.recurrence = listOf(cmd.recurrenceRule)
        }
```

`EventService.kt` — `CreateEventCommand` add `val recurrenceRule: String? = null`; `EventView` add `val recurringEventId: String?`; `toEventCommand()` add `recurrenceRule = recurrenceRule`; `Event.toView()` add `recurringEventId = recurrenceId`.

`EventController.kt` — `toCommand()` add `recurrenceRule = recurrenceRule`; `toResponse()` add `recurringEventId = recurringEventId` and `recurrenceRule = null` (normal responses never carry the rule; only `getEventSeries` sets it — Task 11).

- [ ] **Step 4: Run tests**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventMapperTest*' --tests '*EventControllerTest*'"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar backend/src/test/kotlin/com/familyhub/google/calendar/EventMapperTest.kt
git commit -m "feat(calendar): create recurring events + expose recurringEventId"
```

---

### Task 11: Backend — series scope (edit/delete) + series endpoint

**Files:**
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/GoogleCalendarClient.kt` (add `getEvent`)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventService.kt` (`update`/`delete` gain `scope`; add `getSeries`)
- Modify: `backend/src/main/kotlin/com/familyhub/google/calendar/EventController.kt` (pass `scope`; implement `getEventSeries`)
- Test: `backend/src/test/kotlin/com/familyhub/google/calendar/EventServiceTest.kt`

**Interfaces:**
- Consumes: `EventCommand.recurrenceRule` (Task 10), entity `recurrenceId`.
- Produces:
  - `GoogleCalendarClient.getEvent(connection, calendarId, eventId): GoogleEvent`
  - `EventService.update(id, cmd, scope: String = "instance")` and `EventService.delete(id, scope: String = "instance")`
  - `EventService.getSeries(id): EventView` — resolves the parent by `recurrenceId`, fetches from Google, returns a view whose `recurringEventId` = parent id and (new) recurrence rule surfaced via the controller.

Because `EventView` has no rule field, `getSeries` returns the parent view plus the rule via a small wrapper. Keep it simple: add `val recurrenceRule: String? = null` to `EventView` (default null), populated only by `getSeries`.

- [ ] **Step 1: Failing service test** — append to `EventServiceTest.kt` (this file already mocks `GoogleCalendarClient`, repositories; mirror its setup):

```kotlin
@Test
fun `delete with series scope targets the parent recurring event`() {
    // given a local instance carrying recurrenceId = "master1"
    val instance = testEvent(googleEventId = "master1_20260731", recurrenceId = "master1")
    whenever(eventRepository.findById(instance.id!!)).thenReturn(java.util.Optional.of(instance))
    whenever(connectionRepository.findByFamilyMemberId(instance.ownerMemberId)).thenReturn(testConnection)

    service.delete(instance.id!!, scope = "series")

    verify(calendarClient).deleteEvent(testConnection, instance.googleCalendarId, "master1")
    verify(eventRepository).delete(instance)
}
```

(Use whatever `testEvent`/`testConnection` builders exist in the file; add a `recurrenceId` arg to the builder if needed.)

- [ ] **Step 2: Run to verify fail**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventServiceTest*'"`
Expected: FAIL — `delete` has no `scope` parameter.

- [ ] **Step 3: Implement.**

`GoogleCalendarClient.kt` — add:

```kotlin
    fun getEvent(
        connection: GoogleConnection,
        calendarId: String,
        eventId: String,
    ): com.google.api.services.calendar.model.Event =
        buildCalendar(connection).events().get(calendarId, eventId).execute()
```

`EventService.kt` — change `delete` signature and branch on scope:

```kotlin
    fun delete(id: UUID, scope: String = "instance") {
        val local = eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }
        val connection = connectionRepository.findByFamilyMemberId(local.ownerMemberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

        val targetGoogleId =
            if (scope == "series") {
                local.recurrenceId
                    ?: throw ValidationException("Termin gehört zu keiner Serie")
            } else {
                local.googleEventId
            }
        calendarClient.deleteEvent(connection, local.googleCalendarId, targetGoogleId)
        eventRepository.delete(local)
        // Remaining series instances are pruned on the next sync (cancelled entries).
    }
```

Change `update` similarly — for `scope == "series"` set `googleEvent.id = local.recurrenceId` (parent) instead of the instance id, and require `recurrenceId != null`:

```kotlin
    fun update(id: UUID, cmd: CreateEventCommand, scope: String = "instance"): EventView {
        requireValidTiming(cmd)
        val local = eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }
        val connection = connectionRepository.findByFamilyMemberId(local.ownerMemberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val subscription = subscriptionRepository
            .findByConnectionIdAndGoogleCalendarId(connection.id!!, local.googleCalendarId)
            ?: throw ResourceNotFoundException("Kalender-Abonnement nicht gefunden")

        val googleEvent = mapper.toGoogleEvent(cmd.toEventCommand())
        googleEvent.id =
            if (scope == "series") {
                local.recurrenceId ?: throw ValidationException("Termin gehört zu keiner Serie")
            } else {
                local.googleEventId
            }
        val updated = calendarClient.updateEvent(connection, local.googleCalendarId, googleEvent)
        val entity = mapper.toEntity(updated, subscription, local.ownerMemberId)
        entity.id = local.id
        return eventRepository.save(entity).toView()
    }
```

Add `getSeries`:

```kotlin
    fun getSeries(id: UUID): EventView {
        val local = eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }
        val parentId = local.recurrenceId
            ?: throw ValidationException("Termin gehört zu keiner Serie")
        val connection = connectionRepository.findByFamilyMemberId(local.ownerMemberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val subscription = subscriptionRepository
            .findByConnectionIdAndGoogleCalendarId(connection.id!!, local.googleCalendarId)
            ?: throw ResourceNotFoundException("Kalender-Abonnement nicht gefunden")

        val master = calendarClient.getEvent(connection, local.googleCalendarId, parentId)
        val entity = mapper.toEntity(master, subscription, local.ownerMemberId)
        return entity.toView().copy(
            recurringEventId = parentId,
            recurrenceRule = master.recurrence?.firstOrNull { it.startsWith("RRULE") },
        )
    }
```

Add `val recurrenceRule: String? = null` to `EventView`.

`EventController.kt` — update overrides:

```kotlin
    override fun updateEvent(
        id: UUID,
        scope: String?,
        eventCreateRequest: EventCreateRequest,
    ): ResponseEntity<EventResponse> =
        ResponseEntity.ok(eventService.update(id, eventCreateRequest.toCommand(), scope ?: "instance").toResponse())

    override fun deleteEvent(id: UUID, scope: String?): ResponseEntity<Unit> {
        eventService.delete(id, scope ?: "instance")
        return ResponseEntity.noContent().build()
    }

    override fun getEventSeries(id: UUID): ResponseEntity<EventResponse> =
        ResponseEntity.ok(eventService.getSeries(id).toResponse())
```

(The generated `EventsApi` method parameter order/nullability comes from the spec — align the override signatures with the regenerated interface. `scope` is nullable because it has a default.)

In `EventController.kt`, change the `recurrenceRule = null` line added to `EventView.toResponse()` in Task 10 to `recurrenceRule = recurrenceRule` (the field now exists on `EventView`; it stays null for non-series views and is populated only by `getSeries`).

- [ ] **Step 4: Run tests**

Run: `bash -l -c "cd backend && ./gradlew test --tests '*EventServiceTest*' --tests '*EventControllerTest*'"`
Expected: PASS. Add an analogous `update ... series scope targets parent` test and a `getSeries returns RRULE` test (mock `calendarClient.getEvent` to return a Google event with `recurrence = listOf("RRULE:FREQ=WEEKLY")`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/familyhub/google/calendar backend/src/test/kotlin/com/familyhub/google/calendar/EventServiceTest.kt
git commit -m "feat(calendar): series-scoped edit/delete + series endpoint (FA-KAL-22)"
```

- [ ] **Step 6: Full backend gate**

Run: `bash -l -c "cd backend && ./gradlew check"`
Expected: ktlint + detekt + tests + coverage green. (If JaCoCo flags the new branches, cover the `scope == "series"` and `recurrenceId == null` paths.)

---

### Task 12: Frontend — RRULE build/parse

**Files:**
- Create: `frontend/src/features/calendar/recurrence.ts`
- Test: `frontend/src/features/calendar/recurrence.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'`
  - `type WeekdayCode = 'MO'|'TU'|'WE'|'TH'|'FR'|'SA'|'SU'`
  - `type RecurrenceEnd = { type: 'never' } | { type: 'until'; date: string } | { type: 'count'; count: number }` (`date` is `yyyy-MM-dd`)
  - `interface RecurrenceState { frequency: Frequency; interval: number; weekdays: WeekdayCode[]; end: RecurrenceEnd }`
  - `const EMPTY_RECURRENCE: RecurrenceState`
  - `buildRrule(state: RecurrenceState, opts: { isAllDay: boolean }): string | null` (null when `frequency === 'none'`)
  - `parseRrule(rule: string | null): RecurrenceState`

- [ ] **Step 1: Write the failing test** — `recurrence.test.ts`:

```ts
import { buildRrule, parseRrule, EMPTY_RECURRENCE } from './recurrence'

it('returns null for no recurrence', () => {
  expect(buildRrule(EMPTY_RECURRENCE, { isAllDay: false })).toBeNull()
})

it('builds a weekly rule with weekdays and count', () => {
  const rule = buildRrule(
    { frequency: 'weekly', interval: 1, weekdays: ['MO', 'WE'], end: { type: 'count', count: 10 } },
    { isAllDay: false },
  )
  expect(rule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=10')
})

it('builds an until rule (timed → UTC datetime)', () => {
  const rule = buildRrule(
    { frequency: 'daily', interval: 2, weekdays: [], end: { type: 'until', date: '2026-12-31' } },
    { isAllDay: false },
  )
  expect(rule).toBe('RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261231T235959Z')
})

it('builds an until rule (all-day → date only)', () => {
  const rule = buildRrule(
    { frequency: 'monthly', interval: 1, weekdays: [], end: { type: 'until', date: '2026-12-31' } },
    { isAllDay: true },
  )
  expect(rule).toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20261231')
})

it('round-trips through parseRrule', () => {
  const state = { frequency: 'weekly' as const, interval: 1, weekdays: ['FR' as const], end: { type: 'never' as const } }
  const rule = buildRrule(state, { isAllDay: false })!
  expect(parseRrule(rule)).toEqual(state)
})

it('parseRrule of null/empty yields no recurrence', () => {
  expect(parseRrule(null)).toEqual(EMPTY_RECURRENCE)
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/calendar/recurrence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `recurrence.ts`:**

```ts
export type Frequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'until'; date: string }
  | { type: 'count'; count: number }

export interface RecurrenceState {
  frequency: Frequency
  interval: number
  weekdays: WeekdayCode[]
  end: RecurrenceEnd
}

export const EMPTY_RECURRENCE: RecurrenceState = {
  frequency: 'none',
  interval: 1,
  weekdays: [],
  end: { type: 'never' },
}

const FREQ: Record<Exclude<Frequency, 'none'>, string> = {
  daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY',
}
const FREQ_REVERSE: Record<string, Frequency> = {
  DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly',
}

export function buildRrule(state: RecurrenceState, opts: { isAllDay: boolean }): string | null {
  if (state.frequency === 'none') return null
  const parts = [`FREQ=${FREQ[state.frequency]}`, `INTERVAL=${state.interval}`]
  if (state.frequency === 'weekly' && state.weekdays.length > 0) {
    parts.push(`BYDAY=${state.weekdays.join(',')}`)
  }
  if (state.end.type === 'until') {
    const compact = state.end.date.replace(/-/g, '')
    parts.push(`UNTIL=${opts.isAllDay ? compact : `${compact}T235959Z`}`)
  } else if (state.end.type === 'count') {
    parts.push(`COUNT=${state.end.count}`)
  }
  return `RRULE:${parts.join(';')}`
}

export function parseRrule(rule: string | null): RecurrenceState {
  if (!rule) return EMPTY_RECURRENCE
  const body = rule.replace(/^RRULE:/, '')
  const map = new Map<string, string>()
  for (const kv of body.split(';')) {
    const [k, v] = kv.split('=')
    if (k && v) map.set(k, v)
  }
  const frequency = FREQ_REVERSE[map.get('FREQ') ?? ''] ?? 'none'
  if (frequency === 'none') return EMPTY_RECURRENCE
  const interval = Number(map.get('INTERVAL') ?? '1')
  const weekdays = (map.get('BYDAY')?.split(',') as WeekdayCode[]) ?? []
  let end: RecurrenceEnd = { type: 'never' }
  if (map.has('COUNT')) {
    end = { type: 'count', count: Number(map.get('COUNT')) }
  } else if (map.has('UNTIL')) {
    const u = map.get('UNTIL')!.slice(0, 8) // YYYYMMDD
    end = { type: 'until', date: `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` }
  }
  return { frequency, interval, weekdays, end }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/features/calendar/recurrence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/recurrence.ts frontend/src/features/calendar/recurrence.test.ts
git commit -m "feat(calendar): RRULE build/parse helper"
```

---

### Task 13: Frontend — recurrence fields + series-scope dialog

**Files:**
- Create: `frontend/src/features/calendar/RecurrenceFields.tsx`
- Test: `frontend/src/features/calendar/RecurrenceFields.test.tsx`
- Modify: `frontend/src/features/calendar/EventDialog.tsx`
- Modify: `frontend/src/features/calendar/useCalendarEvents.ts` (scope-aware update/delete + `recurringEventId` on `CalendarEvent`)

**Interfaces:**
- Consumes: `recurrence.ts` helpers, generated `UpdateEventParams`/`DeleteEventParams`, `getEventSeries` fetcher.
- Produces: `RecurrenceFields({ state, onChange, eventDate }: { state: RecurrenceState; onChange: (s: RecurrenceState) => void; eventDate: Date })`; `CalendarEvent.recurringEventId: string | null`; `useUpdateEventMutation`/`useDeleteEventMutation` accept an optional `scope`.

- [ ] **Step 1: Extend `CalendarEvent`** — in `useCalendarEvents.ts` add `recurringEventId: string | null` to the interface and `recurringEventId: e.recurringEventId ?? null` to `toCalendarEvent`.

- [ ] **Step 2: Make mutations scope-aware.** Update `useUpdateEventMutation`/`useDeleteEventMutation` so callers can pass `scope`. The generated mutation variables include `params` (e.g. `{ id, data, params }` for update, `{ id, params }` for delete) — align with the regenerated types in `familyHubAPI.ts`. Keep the existing `onSuccess` invalidation. Example (update):

```ts
export function useUpdateEventMutation() {
  const queryClient = useQueryClient()
  return useUpdateEvent({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}
```

Callers pass `scope` via the mutation variables: `update.mutateAsync({ id, data, params: { scope: 'series' } })`. (If orval named the params type/field differently, use its exact shape.)

- [ ] **Step 3: Write `RecurrenceFields.test.tsx`** — render with `frequency: 'none'` shows only the frequency select; choosing "Wöchentlich" reveals interval, weekday chips (event weekday pre-checked), and end options; changing a control calls `onChange` with the updated state. Assert via `onChange` mock.

- [ ] **Step 4: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/calendar/RecurrenceFields.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 5: Implement `RecurrenceFields.tsx`** — a controlled group driven by `RecurrenceState`:
  - Select "Wiederholung": Keine/Täglich/Wöchentlich/Monatlich/Jährlich → sets `frequency`; when switching to `weekly` with empty `weekdays`, default to the event's weekday (`['MO'..'SU'][ (getDay(eventDate)+6)%7 ]`).
  - When `frequency !== 'none'`: number input "Intervall" (min 1) → `interval`.
  - When `frequency === 'weekly'`: seven toggle buttons Mo–So (`aria-pressed`, ≥44px) → toggle in `weekdays`.
  - "Ende": radio Nie / Am (date input) / Nach (number) N Terminen → `end`.
  - All controls call `onChange({ ...state, … })`.

- [ ] **Step 6: Wire into `EventDialog.tsx`:**
  - Add state: `const [recurrence, setRecurrence] = useState<RecurrenceState>(EMPTY_RECURRENCE)`.
  - **Create mode only:** render `<RecurrenceFields state={recurrence} onChange={setRecurrence} eventDate={new Date(`${date}T${startTime}:00`)} />` and include `recurrenceRule: buildRrule(recurrence, { isAllDay }) ?? null` in the `data` payload.
  - **Edit mode, event has `initial.recurringEventId`:** show a scope choice before save/delete — two radios "Nur diesen Termin" / "Ganze Serie" (`const [scope, setScope] = useState<'instance'|'series'>('instance')`). Pass `scope` into the update/delete mutation variables.
  - **Series prefill:** when the user picks "Ganze Serie" in edit mode, call the generated `getEventSeries(initial.id)` to fetch the parent, then `parseRrule(response.data.recurrenceRule)` into a `RecurrenceState` and show `RecurrenceFields` so the rule is editable; include `buildRrule(...)` in the payload. Guard with a loading state; on fetch error show the existing error banner text pattern.
  - Badge/label: no change here (Task 14 handles display badges).

- [ ] **Step 7: Update `EventDialog.test.tsx`** — add: creating with weekly recurrence sends a `recurrenceRule` starting `RRULE:FREQ=WEEKLY`; editing an event with `recurringEventId` shows the "Ganze Serie" option and deleting with it set sends `params.scope === 'series'`. Mock `getEventSeries` where needed.

- [ ] **Step 8: Run frontend check**

Run: `cd frontend && npx vitest run src/features/calendar/ && npm run check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/calendar/RecurrenceFields.tsx frontend/src/features/calendar/RecurrenceFields.test.tsx frontend/src/features/calendar/EventDialog.tsx frontend/src/features/calendar/EventDialog.test.tsx frontend/src/features/calendar/useCalendarEvents.ts
git commit -m "feat(calendar): recurrence fields + series-scope edit/delete (FA-KAL-22)"
```

---

### Task 14: Series badge in `EventBlock` + `AgendaList`

**Files:**
- Modify: `frontend/src/features/calendar/EventBlock.tsx`
- Modify: `frontend/src/features/calendar/AgendaList.tsx`
- Test: `frontend/src/features/calendar/EventBlock.test.tsx`, `AgendaList.test.tsx`

**Interfaces:**
- Consumes: `CalendarEvent.recurringEventId`.
- Produces: events with a series parent render a 🔁 marker. `EventBlock` gains an optional prop `isRecurring?: boolean`.

- [ ] **Step 1: Failing `EventBlock` test** — append:

```tsx
it('shows a series marker when recurring', () => {
  render(<EventBlock title="Sport" colorHex="#f00" top={0} height={40} leftPct={0} widthPct={100} onClick={() => {}} isRecurring />)
  expect(screen.getByLabelText('Serie')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx vitest run src/features/calendar/EventBlock.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement.** `EventBlock.tsx` — add `isRecurring?: boolean` to props and render a marker inside the button:

```tsx
{isRecurring && <span aria-label="Serie" className="mr-1">🔁</span>}
```

Wherever `EventBlock` is instantiated (in `DayColumn`/grids), pass `isRecurring={event.recurringEventId != null}`. In `AgendaList.tsx`, add the same marker before the title:

```tsx
{e.recurringEventId != null && <span aria-label="Serie" className="mr-1">🔁</span>}
```

Add an `AgendaList` test asserting the marker appears for a recurring event.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/features/calendar/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/EventBlock.tsx frontend/src/features/calendar/AgendaList.tsx frontend/src/features/calendar/EventBlock.test.tsx frontend/src/features/calendar/AgendaList.test.tsx frontend/src/features/calendar/DayColumn.tsx
git commit -m "feat(calendar): series badge on events (FA-KAL-22)"
```

---

### Task 15: e2e — series create → badge → delete series

**Files:**
- Modify: `frontend/e2e/calendar.spec.ts`

**Interfaces:**
- Consumes: the full recurrence UI + API. Follow the existing create/edit/delete e2e in this file (same fixtures, same API stubbing/backend approach it already uses).

- [ ] **Step 1: Add the e2e flow** — mirroring the existing spec's setup:
  1. Open the create dialog, fill title + member + time, set "Wiederholung" = Wöchentlich, save.
  2. Assert the created event shows the 🔁 "Serie" marker.
  3. Open it, choose "Ganze Serie", delete, confirm.
  4. Assert the event (all instances in view) is gone.

- [ ] **Step 2: Run e2e**

Run: `cd frontend && npm run test:e2e -- calendar.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/calendar.spec.ts
git commit -m "test(calendar): e2e recurring create/badge/delete-series flow"
```

- [ ] **Step 4: Full gate**

Run: `bash -l -c "cd backend && ./gradlew check"` then `cd frontend && npm run check`
Expected: both green (equivalent to `scripts/pre-commit-check.sh`).

**Increment 3 done:** recurring events can be created, are badged, and can be edited/deleted per instance or per series; tests + CI green.

---

## Final verification

- [ ] Run `scripts/pre-commit-check.sh` — backend `./gradlew check` + frontend `npm run check` both green.
- [ ] Manual smoke (via `/run` or dev server): Agenda toggle lists upcoming events grouped by day; reminder dropdown persists after reopening an event; creating a weekly event shows the 🔁 badge; "Ganze Serie löschen" removes all instances after sync.
- [ ] Update the status column in `docs/concept/02-funktionale-anforderungen.md` for `FA-KAL-21` (Agenda), `FA-KAL-22`, `FA-KAL-23` to reflect the new reality (and correct the already-stale `FA-KAL-19/25/27` while there). Commit as `docs(concept): refresh FA-KAL status after calendar round-out`.
