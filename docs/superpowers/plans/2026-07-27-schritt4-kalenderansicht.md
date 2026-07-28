# Schritt 4 — Kalenderansicht (Woche + Tag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend calendar UI (week + day views) on top of the existing event CRUD API, so all family members' Google-synced events appear color-coded in a glanceable, touch-friendly grid that can be created, edited, deleted, and synced.

**Architecture:** A new `features/calendar/` feature-slice. Pure, DOM-free modules (`dates.ts`, `layout.ts`) hold all date math and grid geometry so they can be exhaustively unit-tested. React components (`WeekGrid`, `DayGrid`, `DayColumn`, `TimeGrid`, `EventBlock`, `AllDayRow`, `CurrentTimeLine`) are thin renderers driven by those pure functions. Data flows through orval-generated hooks wrapped in `useCalendarEvents.ts` (query + mutations) and `useCalendarSync.ts` (sync all connected members). A minimal `AppShell` makes the calendar the start page (`/`) and moves settings to `/settings`.

**Tech Stack:** React 18 / TypeScript / Vite, TanStack Query v5, React Router v6, Tailwind, `date-fns` (new, with `de` locale), vitest + Testing Library, Playwright. orval-generated client under `src/api/generated/`.

## Global Constraints

- **German-language UI throughout.** All visible strings in German; dates/times/weekdays via `date-fns` `de` locale (`FA-ALLG-03`).
- **Touch targets ≥ 44 × 44 px; no hover-only interactions.** Large text, high contrast (viewing distance 1–3 m).
- **Contract-first.** Never hand-edit `src/api/generated/**`. Consume generated hooks/functions from `@/api/generated/endpoints/familyHubAPI` and types from `@/api/generated/model`.
- **Grid geometry constants (`FA-KAL-02`):** visible hours **06:00–22:00**, `HOUR_PX = 50` → grid height **800 px**.
- **Member colors have a single source:** reuse `MEMBER_COLORS` from `frontend/src/features/members/colors.ts`. Do not introduce a second color palette.
- **Pure modules stay pure:** `dates.ts` and `layout.ts` import no React/DOM — only `date-fns` and plain values.
- **Gate before done:** a feature is done only when reachable through the UI, `npm run check` is green (`tsc --noEmit`, `eslint --max-warnings 0`, dependency-cruiser, coverage), and CI passes. Every new module gets a colocated test (also satisfies dependency-cruiser `no-orphans`).
- **All frontend commands run from `frontend/`.**

## Interface Reference (generated client — do not redefine)

From `@/api/generated/endpoints/familyHubAPI`:
- `useListEvents(params?: ListEventsParams, ...)` → `query.data?.data: EventResponse[]`
- `getListEventsQueryKey(params?)` — call with **no args** to get the prefix key for invalidation.
- `useCreateEvent({ mutation })` → variables `{ data: EventCreateRequest }`
- `useUpdateEvent({ mutation })` → variables `{ id: string; data: EventCreateRequest }`
- `useDeleteEvent({ mutation })` → variables `{ id: string }`
- `syncCalendars(params: { memberId: string })` — raw async fn (also `useSyncCalendars`).

Types (`@/api/generated/model`):
- `EventResponse { id; title; description?; location?; start?; end?; isAllDay; allDayStart?; allDayEnd?; memberId; calendarId }` — `start`/`end` are ISO date-time strings; `allDayStart`/`allDayEnd` are `yyyy-MM-dd`.
- `EventCreateRequest { memberId; calendarId?; title; description?; location?; start?; end?; allDayStart?; allDayEnd?; isAllDay }`
- `MemberResponse { id; name; role; color; ... }` — `color` is a string key like `'blue'`.
- `ConnectionResponse { connectionId; memberId; email; name; status; lastSyncedAt?; scopes }`

Existing reusable modules:
- `@/features/members/colors` → `MEMBER_COLORS`, `MEMBER_COLOR_KEYS`, `MemberColor`.
- `@/features/members/useMembersQuery` → `useMembers()` → `{ members: MemberResponse[], isLoading, isError }`.
- `@/features/google/useGoogleConnections` → `useGoogleConnections()` → `{ connections: ConnectionResponse[], isLoading, isError }`.
- `@/routing/SetupGuard` → `SetupGuard`.
- Test helper `@/test/testUtils` → `renderWithProviders(ui, { route })`, `createTestQueryClient()`.

---

## Task 1: `date-fns` dependency + `dates.ts` (pure date logic)

**Files:**
- Modify: `frontend/package.json` (add `date-fns`)
- Create: `frontend/src/features/calendar/dates.ts`
- Test: `frontend/src/features/calendar/dates.test.ts`

**Interfaces:**
- Consumes: `date-fns`, `date-fns/locale` (`de`).
- Produces:
  - `type CalendarViewMode = 'week' | 'day'`
  - `interface VisibleRange { start: Date; end: Date }`
  - `visibleRange(anchor: Date, view: CalendarViewMode): VisibleRange`
  - `weekDays(anchor: Date): Date[]` — 7 dates Mon..Sun at 00:00
  - `shiftAnchor(anchor: Date, view: CalendarViewMode, dir: 1 | -1): Date`
  - `rangeParams(range: VisibleRange): { start: string; end: string }` — ISO strings for the API
  - `periodLabel(anchor: Date): string` — e.g. `'Juli 2026'`
  - `weekdayHeader(day: Date): string` — e.g. `'Mo 21'`
  - `dayNumber(day: Date): string` — e.g. `'21'`
  - `isSameDayAs(a: Date, b: Date): boolean`
  - `formatTime(d: Date): string` — `'HH:mm'`
  - `allDaySpansDay(start: string, end: string | null, day: Date): boolean` — Google end-exclusive semantics

- [ ] **Step 1: Add the dependency**

Run: `cd frontend && npm install date-fns@^3.6.0`
Expected: `date-fns` appears under `dependencies` in `frontend/package.json`; install succeeds.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/calendar/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  visibleRange,
  weekDays,
  shiftAnchor,
  rangeParams,
  periodLabel,
  weekdayHeader,
  dayNumber,
  isSameDayAs,
  formatTime,
  allDaySpansDay,
} from './dates'

// Monday 2026-07-20 .. Sunday 2026-07-26; anchor Wed 2026-07-22 12:00 local
const anchor = new Date(2026, 6, 22, 12, 0)

describe('weekDays', () => {
  it('returns Monday..Sunday starting on Monday', () => {
    const days = weekDays(anchor)
    expect(days).toHaveLength(7)
    expect(days[0].getDate()).toBe(20) // Monday
    expect(days[6].getDate()).toBe(26) // Sunday
    expect(days[0].getHours()).toBe(0)
  })
})

describe('visibleRange', () => {
  it('week spans Monday 00:00 to Sunday 23:59', () => {
    const r = visibleRange(anchor, 'week')
    expect(r.start.getDate()).toBe(20)
    expect(r.start.getHours()).toBe(0)
    expect(r.end.getDate()).toBe(26)
    expect(r.end.getHours()).toBe(23)
  })
  it('day spans the anchor 00:00..23:59', () => {
    const r = visibleRange(anchor, 'day')
    expect(r.start.getDate()).toBe(22)
    expect(r.start.getHours()).toBe(0)
    expect(r.end.getDate()).toBe(22)
    expect(r.end.getHours()).toBe(23)
  })
})

describe('shiftAnchor', () => {
  it('moves by 7 days in week view', () => {
    expect(shiftAnchor(anchor, 'week', 1).getDate()).toBe(29)
    expect(shiftAnchor(anchor, 'week', -1).getDate()).toBe(15)
  })
  it('moves by 1 day in day view', () => {
    expect(shiftAnchor(anchor, 'day', 1).getDate()).toBe(23)
    expect(shiftAnchor(anchor, 'day', -1).getDate()).toBe(21)
  })
})

describe('rangeParams', () => {
  it('serialises to ISO strings', () => {
    const p = rangeParams(visibleRange(anchor, 'day'))
    expect(typeof p.start).toBe('string')
    expect(p.start).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('formatting (de locale)', () => {
  it('periodLabel is German month + year', () => {
    expect(periodLabel(anchor)).toBe('Juli 2026')
  })
  it('weekdayHeader is short weekday + day number', () => {
    expect(weekdayHeader(new Date(2026, 6, 21))).toBe('Di 21')
  })
  it('dayNumber is the day of month', () => {
    expect(dayNumber(new Date(2026, 6, 21))).toBe('21')
  })
  it('formatTime is HH:mm', () => {
    expect(formatTime(new Date(2026, 6, 21, 9, 5))).toBe('09:05')
  })
})

describe('isSameDayAs', () => {
  it('true for same calendar day, false otherwise', () => {
    expect(isSameDayAs(new Date(2026, 6, 21, 1), new Date(2026, 6, 21, 23))).toBe(true)
    expect(isSameDayAs(new Date(2026, 6, 21), new Date(2026, 6, 22))).toBe(false)
  })
})

describe('allDaySpansDay (end exclusive)', () => {
  const day21 = new Date(2026, 6, 21)
  const day22 = new Date(2026, 6, 22)
  it('null end means single day', () => {
    expect(allDaySpansDay('2026-07-21', null, day21)).toBe(true)
    expect(allDaySpansDay('2026-07-21', null, day22)).toBe(false)
  })
  it('multi-day range includes start up to (excluding) end', () => {
    expect(allDaySpansDay('2026-07-21', '2026-07-23', day21)).toBe(true)
    expect(allDaySpansDay('2026-07-21', '2026-07-23', day22)).toBe(true)
    expect(allDaySpansDay('2026-07-21', '2026-07-23', new Date(2026, 6, 23))).toBe(false)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/dates.test.ts`
Expected: FAIL — `Failed to resolve import "./dates"` / functions undefined.

- [ ] **Step 4: Write the implementation**

Create `frontend/src/features/calendar/dates.ts`:

```ts
import {
  startOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  format,
  isSameDay,
} from 'date-fns'
import { de } from 'date-fns/locale'

export type CalendarViewMode = 'week' | 'day'

export interface VisibleRange {
  start: Date
  end: Date
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function visibleRange(anchor: Date, view: CalendarViewMode): VisibleRange {
  if (view === 'day') {
    return { start: startOfDay(anchor), end: endOfDay(anchor) }
  }
  const days = weekDays(anchor)
  return { start: startOfDay(days[0]), end: endOfDay(days[6]) }
}

export function shiftAnchor(anchor: Date, view: CalendarViewMode, dir: 1 | -1): Date {
  return view === 'day' ? addDays(anchor, dir) : addDays(anchor, dir * 7)
}

export function rangeParams(range: VisibleRange): { start: string; end: string } {
  return { start: range.start.toISOString(), end: range.end.toISOString() }
}

export function periodLabel(anchor: Date): string {
  return format(anchor, 'MMMM yyyy', { locale: de })
}

export function weekdayHeader(day: Date): string {
  return format(day, 'EEEEEE dd', { locale: de })
}

export function dayNumber(day: Date): string {
  return format(day, 'd')
}

export function isSameDayAs(a: Date, b: Date): boolean {
  return isSameDay(a, b)
}

export function formatTime(d: Date): string {
  return format(d, 'HH:mm')
}

export function allDaySpansDay(start: string, end: string | null, day: Date): boolean {
  const key = format(day, 'yyyy-MM-dd')
  if (!end) return key === start
  return key >= start && key < end
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/dates.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/features/calendar/dates.ts frontend/src/features/calendar/dates.test.ts
git commit -m "feat(calendar): add date-fns and pure date helpers (dates.ts)"
```

---

## Task 2: `layout.ts` (pure grid geometry)

**Files:**
- Create: `frontend/src/features/calendar/layout.ts`
- Test: `frontend/src/features/calendar/layout.test.ts`

**Interfaces:**
- Consumes: nothing (plain math).
- Produces:
  - Constants: `START_HOUR = 6`, `END_HOUR = 22`, `HOUR_PX = 50`, `MIN_BLOCK_PX = 24`, `GRID_HEIGHT_PX = 800`, `HOURS: number[]` (`[6..22]`)
  - `interface TimedInput { id: string; start: Date; end: Date }`
  - `interface Positioned { id: string; top: number; height: number; leftPct: number; widthPct: number }`
  - `verticalPosition(start: Date, end: Date): { top: number; height: number }`
  - `layoutDay(events: TimedInput[]): Positioned[]`
  - `nowLineTop(now: Date): number | null`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  verticalPosition,
  layoutDay,
  nowLineTop,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
} from './layout'

const at = (h: number, m = 0) => new Date(2026, 6, 21, h, m)

describe('verticalPosition', () => {
  it('positions a 09:00–10:00 block', () => {
    const { top, height } = verticalPosition(at(9), at(10))
    expect(top).toBe(150) // (9-6)*50
    expect(height).toBe(50)
  })
  it('accounts for minutes', () => {
    const { top } = verticalPosition(at(6, 30), at(7))
    expect(top).toBe(25)
  })
  it('clamps a block that starts before 06:00', () => {
    const { top, height } = verticalPosition(at(5), at(7))
    expect(top).toBe(0)
    expect(height).toBe(50) // only 06:00–07:00 is visible
  })
  it('clamps a block that ends after 22:00', () => {
    const { top, height } = verticalPosition(at(21), at(23, 30))
    expect(top).toBe(750)
    expect(height).toBe(GRID_HEIGHT_PX - 750) // clamped to 22:00
  })
  it('enforces a minimum height', () => {
    const { height } = verticalPosition(at(9), at(9, 10))
    expect(height).toBe(MIN_BLOCK_PX)
  })
})

describe('layoutDay overlap columns', () => {
  it('gives a lone event full width', () => {
    const out = layoutDay([{ id: 'a', start: at(9), end: at(10) }])
    expect(out[0].widthPct).toBe(100)
    expect(out[0].leftPct).toBe(0)
  })
  it('splits two overlapping events into halves', () => {
    const out = layoutDay([
      { id: 'a', start: at(9), end: at(11) },
      { id: 'b', start: at(10), end: at(12) },
    ])
    const a = out.find((x) => x.id === 'a')!
    const b = out.find((x) => x.id === 'b')!
    expect(a.widthPct).toBe(50)
    expect(b.widthPct).toBe(50)
    expect(new Set([a.leftPct, b.leftPct])).toEqual(new Set([0, 50]))
  })
  it('does not split non-overlapping events', () => {
    const out = layoutDay([
      { id: 'a', start: at(9), end: at(10) },
      { id: 'b', start: at(11), end: at(12) },
    ])
    expect(out.every((x) => x.widthPct === 100)).toBe(true)
  })
})

describe('nowLineTop', () => {
  it('returns pixel offset inside 06–22', () => {
    expect(nowLineTop(at(12))).toBe(300) // (12-6)*50
  })
  it('returns null before 06:00', () => {
    expect(nowLineTop(at(5, 59))).toBeNull()
  })
  it('returns null at/after 22:00', () => {
    expect(nowLineTop(at(22))).toBeNull()
    expect(nowLineTop(at(23))).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/layout.ts`:

```ts
export const START_HOUR = 6
export const END_HOUR = 22
export const HOUR_PX = 50
export const MIN_BLOCK_PX = 24
export const GRID_HEIGHT_PX = (END_HOUR - START_HOUR) * HOUR_PX // 800

export const HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
)

const GRID_MINUTES = (END_HOUR - START_HOUR) * 60 // 960

export interface TimedInput {
  id: string
  start: Date
  end: Date
}

export interface Positioned {
  id: string
  top: number
  height: number
  leftPct: number
  widthPct: number
}

function minutesFromGridStart(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() - START_HOUR * 60
}

function clampMinutes(m: number): number {
  return Math.max(0, Math.min(m, GRID_MINUTES))
}

export function verticalPosition(start: Date, end: Date): { top: number; height: number } {
  const startMin = clampMinutes(minutesFromGridStart(start))
  const endMin = clampMinutes(minutesFromGridStart(end))
  const top = (startMin / 60) * HOUR_PX
  const rawHeight = ((endMin - startMin) / 60) * HOUR_PX
  return { top, height: Math.max(rawHeight, MIN_BLOCK_PX) }
}

export function nowLineTop(now: Date): number | null {
  const minutes = minutesFromGridStart(now)
  if (minutes < 0 || minutes >= GRID_MINUTES) return null
  return (minutes / 60) * HOUR_PX
}

/**
 * Groups events that overlap in time into side-by-side columns and splits the
 * available width evenly within each connected overlap cluster (FA-KAL-07).
 */
export function layoutDay(events: TimedInput[]): Positioned[] {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  )

  const result: Positioned[] = []
  let cluster: { id: string; col: number; top: number; height: number }[] = []
  let columnEnds: number[] = [] // last end-time per column in the current cluster
  let clusterEnd = -Infinity

  const flush = () => {
    const cols = columnEnds.length
    const width = 100 / cols
    for (const item of cluster) {
      result.push({
        id: item.id,
        top: item.top,
        height: item.height,
        leftPct: item.col * width,
        widthPct: width,
      })
    }
    cluster = []
    columnEnds = []
    clusterEnd = -Infinity
  }

  for (const ev of sorted) {
    if (cluster.length && ev.start.getTime() >= clusterEnd) flush()

    let col = columnEnds.findIndex((end) => end <= ev.start.getTime())
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(ev.end.getTime())
    } else {
      columnEnds[col] = ev.end.getTime()
    }

    const { top, height } = verticalPosition(ev.start, ev.end)
    cluster.push({ id: ev.id, col, top, height })
    clusterEnd = Math.max(clusterEnd, ev.end.getTime())
  }
  if (cluster.length) flush()

  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/layout.ts frontend/src/features/calendar/layout.test.ts
git commit -m "feat(calendar): add pure grid geometry (layout.ts)"
```

---

## Task 3: `memberColorHex` helper (reuse the member palette)

**Files:**
- Modify: `frontend/src/features/members/colors.ts`
- Test: `frontend/src/features/members/colors.test.ts`

**Interfaces:**
- Consumes: existing `MEMBER_COLORS`, `MemberColor`.
- Produces: `memberColorHex(color: string): string` — maps a member's `color` key to its HSL value, falling back to blue for unknown keys.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/features/members/colors.test.ts` (append; keep existing tests):

```ts
import { memberColorHex, MEMBER_COLORS } from './colors'

describe('memberColorHex', () => {
  it('resolves a known color key', () => {
    expect(memberColorHex('green')).toBe(MEMBER_COLORS.green)
  })
  it('falls back to blue for an unknown key', () => {
    expect(memberColorHex('chartreuse')).toBe(MEMBER_COLORS.blue)
  })
})
```

> If `colors.test.ts` does not already import `describe/it/expect`, add `import { describe, it, expect } from 'vitest'` at the top (only if missing).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/members/colors.test.ts`
Expected: FAIL — `memberColorHex` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `frontend/src/features/members/colors.ts` (after `MEMBER_COLOR_KEYS`):

```ts
export function memberColorHex(color: string): string {
  return MEMBER_COLORS[color as MemberColor] ?? MEMBER_COLORS.blue
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/members/colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/members/colors.ts frontend/src/features/members/colors.test.ts
git commit -m "feat(members): add memberColorHex resolver for calendar reuse"
```

---

## Task 4: `useCalendarEvents.ts` (query + mutations + mapping)

**Files:**
- Create: `frontend/src/features/calendar/useCalendarEvents.ts`
- Test: `frontend/src/features/calendar/useCalendarEvents.test.tsx`

**Interfaces:**
- Consumes: `useListEvents`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`, `getListEventsQueryKey` (generated); `visibleRange`, `rangeParams`, `CalendarViewMode` (`./dates`); `EventResponse`, `EventCreateRequest` (model).
- Produces:
  - `interface CalendarEvent { id; title; memberId; isAllDay; start: Date | null; end: Date | null; allDayStart: string | null; allDayEnd: string | null; location: string | null; description: string | null }`
  - `useCalendarEvents(anchor: Date, view: CalendarViewMode): { events: CalendarEvent[]; isLoading: boolean; isError: boolean; refetch: () => void }`
  - `useCreateEventMutation()`, `useUpdateEventMutation()`, `useDeleteEventMutation()` — generated mutations wrapped to invalidate `getListEventsQueryKey()` on success.
  - `toCalendarEvent(e: EventResponse): CalendarEvent` (exported for reuse/tests)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/useCalendarEvents.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { toCalendarEvent } from './useCalendarEvents'
import type { EventResponse } from '@/api/generated/model'

describe('toCalendarEvent', () => {
  it('parses a timed event into Date objects', () => {
    const raw: EventResponse = {
      id: '1',
      title: 'Schule',
      isAllDay: false,
      start: '2026-07-21T09:00:00Z',
      end: '2026-07-21T10:00:00Z',
      memberId: 'm1',
      calendarId: 'c1',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.start).toBeInstanceOf(Date)
    expect(ev.end).toBeInstanceOf(Date)
    expect(ev.isAllDay).toBe(false)
    expect(ev.title).toBe('Schule')
  })
  it('keeps all-day dates as strings and leaves start/end null', () => {
    const raw: EventResponse = {
      id: '2',
      title: 'Urlaub',
      isAllDay: true,
      allDayStart: '2026-07-21',
      allDayEnd: '2026-07-23',
      memberId: 'm1',
      calendarId: 'c1',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.start).toBeNull()
    expect(ev.allDayStart).toBe('2026-07-21')
    expect(ev.allDayEnd).toBe('2026-07-23')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/useCalendarEvents.test.tsx`
Expected: FAIL — cannot resolve `./useCalendarEvents`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/useCalendarEvents.ts`:

```ts
import { useQueryClient } from '@tanstack/react-query'
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { EventResponse } from '@/api/generated/model'
import { visibleRange, rangeParams, type CalendarViewMode } from './dates'

export interface CalendarEvent {
  id: string
  title: string
  memberId: string
  isAllDay: boolean
  start: Date | null
  end: Date | null
  allDayStart: string | null
  allDayEnd: string | null
  location: string | null
  description: string | null
}

export function toCalendarEvent(e: EventResponse): CalendarEvent {
  return {
    id: e.id,
    title: e.title,
    memberId: e.memberId,
    isAllDay: e.isAllDay,
    start: e.start ? new Date(e.start) : null,
    end: e.end ? new Date(e.end) : null,
    allDayStart: e.allDayStart ?? null,
    allDayEnd: e.allDayEnd ?? null,
    location: e.location ?? null,
    description: e.description ?? null,
  }
}

export function useCalendarEvents(anchor: Date, view: CalendarViewMode) {
  const params = rangeParams(visibleRange(anchor, view))
  const query = useListEvents(params)
  const events: CalendarEvent[] = (query.data?.data ?? []).map(toCalendarEvent)
  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

export function useCreateEventMutation() {
  const queryClient = useQueryClient()
  return useCreateEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}

export function useUpdateEventMutation() {
  const queryClient = useQueryClient()
  return useUpdateEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}

export function useDeleteEventMutation() {
  const queryClient = useQueryClient()
  return useDeleteEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/useCalendarEvents.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/useCalendarEvents.ts frontend/src/features/calendar/useCalendarEvents.test.tsx
git commit -m "feat(calendar): add useCalendarEvents query + mutation hooks"
```

---

## Task 5: `useCalendarSync.ts` (sync all connected members, FA-KAL-19)

**Files:**
- Create: `frontend/src/features/calendar/useCalendarSync.ts`
- Test: `frontend/src/features/calendar/useCalendarSync.test.tsx`

**Interfaces:**
- Consumes: `useGoogleConnections` (`@/features/google/useGoogleConnections`); `syncCalendars`, `getListEventsQueryKey` (generated); `useQueryClient`.
- Produces: `useCalendarSync(): { sync: () => Promise<void>; isSyncing: boolean; isError: boolean }` — calls `syncCalendars` once per **distinct connected** member (`status !== 'revoked'`), then invalidates the events query. This fixes the old system's "only first member" bug.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/useCalendarSync.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

const syncCalendars = vi.fn()
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  syncCalendars: (params: { memberId: string }) => syncCalendars(params),
  getListEventsQueryKey: () => ['/api/v1/events'],
}))

const connectionsRef = { current: [] as Array<{ memberId: string; status: string }> }
vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: () => ({
    connections: connectionsRef.current,
    isLoading: false,
    isError: false,
  }),
}))

import { useCalendarSync } from './useCalendarSync'

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  syncCalendars.mockReset().mockResolvedValue({ status: 200, data: {} })
})

describe('useCalendarSync', () => {
  it('syncs each distinct connected member once', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm2', status: 'connected' },
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm3', status: 'revoked' },
    ]
    const { result } = renderHook(() => useCalendarSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncCalendars).toHaveBeenCalledTimes(2)
    expect(syncCalendars).toHaveBeenCalledWith({ memberId: 'm1' })
    expect(syncCalendars).toHaveBeenCalledWith({ memberId: 'm2' })
  })

  it('sets isError when a sync call fails', async () => {
    connectionsRef.current = [{ memberId: 'm1', status: 'connected' }]
    syncCalendars.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCalendarSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/useCalendarSync.test.tsx`
Expected: FAIL — cannot resolve `./useCalendarSync`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/useCalendarSync.ts`:

```ts
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  syncCalendars,
  getListEventsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'

export function useCalendarSync() {
  const queryClient = useQueryClient()
  const { connections } = useGoogleConnections()
  const [isSyncing, setIsSyncing] = useState(false)
  const [isError, setIsError] = useState(false)

  const sync = useCallback(async () => {
    setIsSyncing(true)
    setIsError(false)
    try {
      const memberIds = [
        ...new Set(
          connections
            .filter((c) => c.status.toLowerCase() !== 'revoked')
            .map((c) => c.memberId),
        ),
      ]
      for (const memberId of memberIds) {
        await syncCalendars({ memberId })
      }
      await queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() })
    } catch {
      setIsError(true)
    } finally {
      setIsSyncing(false)
    }
  }, [connections, queryClient])

  return { sync, isSyncing, isError }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/useCalendarSync.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/useCalendarSync.ts frontend/src/features/calendar/useCalendarSync.test.tsx
git commit -m "feat(calendar): sync all connected members (FA-KAL-19)"
```

---

## Task 6: `EventBlock` + `AllDayRow` (event render primitives)

**Files:**
- Create: `frontend/src/features/calendar/EventBlock.tsx`
- Create: `frontend/src/features/calendar/AllDayRow.tsx`
- Test: `frontend/src/features/calendar/EventBlock.test.tsx`
- Test: `frontend/src/features/calendar/AllDayRow.test.tsx`

**Interfaces:**
- Consumes: nothing external beyond React.
- Produces:
  - `interface EventBlockProps { title: string; timeLabel?: string; colorHex: string; top: number; height: number; leftPct: number; widthPct: number; onClick: () => void }`
  - `EventBlock(props: EventBlockProps): JSX.Element`
  - `interface AllDayChip { id: string; title: string; colorHex: string; onClick: () => void }`
  - `AllDayRow({ columns }: { columns: AllDayChip[][] }): JSX.Element` — one array of chips per day column.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/calendar/EventBlock.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventBlock } from './EventBlock'

describe('EventBlock', () => {
  it('renders title, applies member color, and fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <EventBlock
        title="Schule"
        timeLabel="09:00"
        colorHex="hsl(140 60% 65%)"
        top={150}
        height={50}
        leftPct={0}
        widthPct={100}
        onClick={onClick}
      />,
    )
    const btn = screen.getByRole('button', { name: /Schule/ })
    expect(btn).toHaveStyle({ backgroundColor: 'hsl(140 60% 65%)' })
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

Create `frontend/src/features/calendar/AllDayRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AllDayRow } from './AllDayRow'

describe('AllDayRow', () => {
  it('renders a chip per all-day event in its column', () => {
    render(
      <AllDayRow
        columns={[
          [{ id: 'a', title: 'Urlaub Papa', colorHex: '#123', onClick: vi.fn() }],
          [],
        ]}
      />,
    )
    expect(screen.getByText('Urlaub Papa')).toBeInTheDocument()
  })
})
```

> `@testing-library/user-event` is a transitive dependency of `@testing-library/react` v16; if the import fails, run `npm install -D @testing-library/user-event@^14` first and commit `package.json` in this task.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- --run src/features/calendar/EventBlock.test.tsx src/features/calendar/AllDayRow.test.tsx`
Expected: FAIL — cannot resolve the new modules.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/features/calendar/EventBlock.tsx`:

```tsx
export interface EventBlockProps {
  title: string
  timeLabel?: string
  colorHex: string
  top: number
  height: number
  leftPct: number
  widthPct: number
  onClick: () => void
}

export function EventBlock({
  title,
  timeLabel,
  colorHex,
  top,
  height,
  leftPct,
  widthPct,
  onClick,
}: EventBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="absolute overflow-hidden rounded-lg px-2 py-1 text-left text-sm font-medium text-slate-900 shadow"
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: colorHex,
      }}
    >
      <span className="block truncate">{title}</span>
      {timeLabel && <span className="block truncate text-xs opacity-80">{timeLabel}</span>}
    </button>
  )
}
```

Create `frontend/src/features/calendar/AllDayRow.tsx`:

```tsx
export interface AllDayChip {
  id: string
  title: string
  colorHex: string
  onClick: () => void
}

export function AllDayRow({ columns }: { columns: AllDayChip[][] }) {
  return (
    <div className="flex border-b border-slate-700">
      <div className="w-12 shrink-0 py-1 text-right text-xs text-slate-400 pr-1">Ganztag</div>
      <div className="flex flex-1">
        {columns.map((chips, i) => (
          <div key={i} className="flex flex-1 flex-col gap-1 p-1">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClick}
                aria-label={chip.title}
                className="truncate rounded px-2 py-1 text-left text-sm font-medium text-slate-900 min-h-[44px]"
                style={{ backgroundColor: chip.colorHex }}
              >
                {chip.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- --run src/features/calendar/EventBlock.test.tsx src/features/calendar/AllDayRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/EventBlock.tsx frontend/src/features/calendar/AllDayRow.tsx frontend/src/features/calendar/EventBlock.test.tsx frontend/src/features/calendar/AllDayRow.test.tsx frontend/package.json
git commit -m "feat(calendar): add EventBlock and AllDayRow primitives"
```

---

## Task 7: `TimeGrid` + `CurrentTimeLine` (shared time axis + now line)

**Files:**
- Create: `frontend/src/features/calendar/TimeGrid.tsx`
- Create: `frontend/src/features/calendar/CurrentTimeLine.tsx`
- Test: `frontend/src/features/calendar/CurrentTimeLine.test.tsx`

**Interfaces:**
- Consumes: `HOURS`, `HOUR_PX`, `GRID_HEIGHT_PX`, `nowLineTop` (`./layout`).
- Produces:
  - `TimeGrid({ children }: { children: ReactNode }): JSX.Element` — left hour gutter (06..22 labels) + horizontal hour lines behind a flex row of day columns (`children`).
  - `CurrentTimeLine({ now }: { now: Date }): JSX.Element | null` — a red horizontal line at `nowLineTop(now)`, or `null` outside 06:00–22:00.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/CurrentTimeLine.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurrentTimeLine } from './CurrentTimeLine'

describe('CurrentTimeLine', () => {
  it('renders a line inside visible hours', () => {
    render(<CurrentTimeLine now={new Date(2026, 6, 21, 12, 0)} />)
    const line = screen.getByTestId('current-time-line')
    expect(line).toHaveStyle({ top: '300px' })
  })
  it('renders nothing outside visible hours', () => {
    render(<CurrentTimeLine now={new Date(2026, 6, 21, 23, 0)} />)
    expect(screen.queryByTestId('current-time-line')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/CurrentTimeLine.test.tsx`
Expected: FAIL — cannot resolve `./CurrentTimeLine`.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/features/calendar/CurrentTimeLine.tsx`:

```tsx
import { nowLineTop } from './layout'

export function CurrentTimeLine({ now }: { now: Date }) {
  const top = nowLineTop(now)
  if (top === null) return null
  return (
    <div
      data-testid="current-time-line"
      className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-red-500"
      style={{ top }}
    />
  )
}
```

Create `frontend/src/features/calendar/TimeGrid.tsx`:

```tsx
import { type ReactNode } from 'react'
import { HOURS, HOUR_PX, GRID_HEIGHT_PX } from './layout'

export function TimeGrid({ children }: { children: ReactNode }) {
  return (
    <div className="flex">
      <div className="w-12 shrink-0" style={{ height: GRID_HEIGHT_PX }}>
        {HOURS.map((h) => (
          <div
            key={h}
            className="relative text-right text-xs text-slate-400 pr-1"
            style={{ height: HOUR_PX }}
          >
            <span className="absolute -top-2 right-1">{String(h).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      <div className="relative flex flex-1" style={{ height: GRID_HEIGHT_PX }}>
        <div className="pointer-events-none absolute inset-0">
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-slate-700"
              style={{ top: i * HOUR_PX }}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/CurrentTimeLine.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/TimeGrid.tsx frontend/src/features/calendar/CurrentTimeLine.tsx frontend/src/features/calendar/CurrentTimeLine.test.tsx
git commit -m "feat(calendar): add TimeGrid axis and CurrentTimeLine"
```

---

## Task 8: `DayColumn` (one day's timed events, slots, today highlight)

**Files:**
- Create: `frontend/src/features/calendar/DayColumn.tsx`
- Test: `frontend/src/features/calendar/DayColumn.test.tsx`

**Interfaces:**
- Consumes: `layoutDay`, `HOURS`, `HOUR_PX` (`./layout`); `EventBlock` (`./EventBlock`); `CurrentTimeLine` (`./CurrentTimeLine`); `formatTime` (`./dates`); `CalendarEvent` (`./useCalendarEvents`).
- Produces:
  - `interface DayColumnItem { event: CalendarEvent; colorHex: string }`
  - `interface DayColumnProps { day: Date; timed: DayColumnItem[]; now: Date; isToday: boolean; onEventClick: (e: CalendarEvent) => void; onSlotClick: (date: Date) => void }`
  - `DayColumn(props: DayColumnProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/DayColumn.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayColumn } from './DayColumn'
import type { CalendarEvent } from './useCalendarEvents'

const day = new Date(2026, 6, 21)

const timedEvent: CalendarEvent = {
  id: 'e1',
  title: 'Schule',
  memberId: 'm1',
  isAllDay: false,
  start: new Date(2026, 6, 21, 9, 0),
  end: new Date(2026, 6, 21, 10, 0),
  allDayStart: null,
  allDayEnd: null,
  location: null,
  description: null,
}

describe('DayColumn', () => {
  it('renders a timed event and fires onEventClick', async () => {
    const onEventClick = vi.fn()
    render(
      <DayColumn
        day={day}
        timed={[{ event: timedEvent, colorHex: '#abc' }]}
        now={new Date(2026, 6, 21, 12, 0)}
        isToday={false}
        onEventClick={onEventClick}
        onSlotClick={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Schule/ }))
    expect(onEventClick).toHaveBeenCalledWith(timedEvent)
  })

  it('shows the now line only when isToday', () => {
    const { rerender } = render(
      <DayColumn
        day={day}
        timed={[]}
        now={new Date(2026, 6, 21, 12, 0)}
        isToday
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.getByTestId('current-time-line')).toBeInTheDocument()
    rerender(
      <DayColumn
        day={day}
        timed={[]}
        now={new Date(2026, 6, 21, 12, 0)}
        isToday={false}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('current-time-line')).toBeNull()
  })

  it('fires onSlotClick with the day + hour of the clicked slot', async () => {
    const onSlotClick = vi.fn()
    render(
      <DayColumn
        day={day}
        timed={[]}
        now={new Date(2026, 6, 21, 12, 0)}
        isToday={false}
        onEventClick={vi.fn()}
        onSlotClick={onSlotClick}
      />,
    )
    await userEvent.click(screen.getByLabelText('Neuer Termin 08:00'))
    const arg = onSlotClick.mock.calls[0][0] as Date
    expect(arg.getHours()).toBe(8)
    expect(arg.getDate()).toBe(21)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/DayColumn.test.tsx`
Expected: FAIL — cannot resolve `./DayColumn`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/DayColumn.tsx`:

```tsx
import { HOURS, HOUR_PX, layoutDay, type Positioned } from './layout'
import { EventBlock } from './EventBlock'
import { CurrentTimeLine } from './CurrentTimeLine'
import { formatTime } from './dates'
import type { CalendarEvent } from './useCalendarEvents'

export interface DayColumnItem {
  event: CalendarEvent
  colorHex: string
}

export interface DayColumnProps {
  day: Date
  timed: DayColumnItem[]
  now: Date
  isToday: boolean
  onEventClick: (e: CalendarEvent) => void
  onSlotClick: (date: Date) => void
}

export function DayColumn({
  day,
  timed,
  now,
  isToday,
  onEventClick,
  onSlotClick,
}: DayColumnProps) {
  const withTimes = timed.filter((t) => t.event.start && t.event.end)
  const positions = layoutDay(
    withTimes.map((t) => ({ id: t.event.id, start: t.event.start!, end: t.event.end! })),
  )
  const posById = new Map<string, Positioned>(positions.map((p) => [p.id, p]))

  return (
    <div
      className={`relative flex-1 border-l border-slate-700 ${isToday ? 'bg-blue-500/10' : ''}`}
    >
      {/* clickable empty hour slots */}
      {HOURS.slice(0, -1).map((h, i) => (
        <button
          key={h}
          type="button"
          aria-label={`Neuer Termin ${String(h).padStart(2, '0')}:00`}
          onClick={() => {
            const d = new Date(day)
            d.setHours(h, 0, 0, 0)
            onSlotClick(d)
          }}
          className="absolute left-0 right-0 block"
          style={{ top: i * HOUR_PX, height: HOUR_PX }}
        />
      ))}

      {withTimes.map((t) => {
        const p = posById.get(t.event.id)
        if (!p) return null
        return (
          <EventBlock
            key={t.event.id}
            title={t.event.title}
            timeLabel={t.event.start ? formatTime(t.event.start) : undefined}
            colorHex={t.colorHex}
            top={p.top}
            height={p.height}
            leftPct={p.leftPct}
            widthPct={p.widthPct}
            onClick={() => onEventClick(t.event)}
          />
        )
      })}

      {isToday && <CurrentTimeLine now={now} />}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/DayColumn.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/DayColumn.tsx frontend/src/features/calendar/DayColumn.test.tsx
git commit -m "feat(calendar): add DayColumn with slots, events, today highlight"
```

---

## Task 9: `WeekGrid` (7 columns) + `DayGrid` (1 column)

**Files:**
- Create: `frontend/src/features/calendar/WeekGrid.tsx`
- Create: `frontend/src/features/calendar/DayGrid.tsx`
- Test: `frontend/src/features/calendar/WeekGrid.test.tsx`

**Interfaces:**
- Consumes: `TimeGrid`, `DayColumn`/`DayColumnItem`, `AllDayRow`/`AllDayChip`, `weekDays`, `weekdayHeader`, `dayNumber`, `isSameDayAs`, `allDaySpansDay` (`./dates`), `memberColorHex` (`@/features/members/colors`), `CalendarEvent` (`./useCalendarEvents`), `MemberResponse`.
- Produces (shared prop type used by both grids and consumed by Task 11):
  - `interface CalendarGridProps { anchor: Date; events: CalendarEvent[]; members: MemberResponse[]; now: Date; onEventClick: (e: CalendarEvent) => void; onSlotClick: (date: Date) => void }`
  - `WeekGrid(props: CalendarGridProps): JSX.Element`
  - `DayGrid(props: CalendarGridProps): JSX.Element`
- Both build a `memberId → colorHex` map from `members` via `memberColorHex(member.color)`, split events into all-day vs timed per day, and render `AllDayRow` above `TimeGrid`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/WeekGrid.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekGrid } from './WeekGrid'
import { DayGrid } from './DayGrid'
import type { CalendarEvent } from './useCalendarEvents'
import type { MemberResponse } from '@/api/generated/model'
import { MEMBER_COLORS } from '@/features/members/colors'

const anchor = new Date(2026, 6, 22, 12) // Wed in week Mon 20 – Sun 26

const members: MemberResponse[] = [
  {
    id: 'm1',
    name: 'Papa',
    role: 'parent',
    color: 'green',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
]

const timed: CalendarEvent = {
  id: 'e1',
  title: 'Schule',
  memberId: 'm1',
  isAllDay: false,
  start: new Date(2026, 6, 21, 9),
  end: new Date(2026, 6, 21, 10),
  allDayStart: null,
  allDayEnd: null,
  location: null,
  description: null,
}

const allDay: CalendarEvent = {
  id: 'e2',
  title: 'Urlaub Papa',
  memberId: 'm1',
  isAllDay: true,
  start: null,
  end: null,
  allDayStart: '2026-07-21',
  allDayEnd: null,
  location: null,
  description: null,
}

describe('WeekGrid', () => {
  it('renders 7 weekday headers Monday..Sunday', () => {
    render(
      <WeekGrid
        anchor={anchor}
        events={[]}
        members={members}
        now={anchor}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.getByText(/Mo 20/)).toBeInTheDocument()
    expect(screen.getByText(/So 26/)).toBeInTheDocument()
  })

  it('colors a timed event by its member color', () => {
    render(
      <WeekGrid
        anchor={anchor}
        events={[timed]}
        members={members}
        now={anchor}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Schule/ })).toHaveStyle({
      backgroundColor: MEMBER_COLORS.green,
    })
  })

  it('renders an all-day event as a chip', () => {
    render(
      <WeekGrid
        anchor={anchor}
        events={[allDay]}
        members={members}
        now={anchor}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.getByText('Urlaub Papa')).toBeInTheDocument()
  })
})

describe('DayGrid', () => {
  it('renders a single day and its timed event', () => {
    render(
      <DayGrid
        anchor={new Date(2026, 6, 21, 12)}
        events={[timed]}
        members={members}
        now={new Date(2026, 6, 21, 12)}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Schule/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/WeekGrid.test.tsx`
Expected: FAIL — cannot resolve `./WeekGrid` / `./DayGrid`.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/features/calendar/WeekGrid.tsx`:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { memberColorHex } from '@/features/members/colors'
import { TimeGrid } from './TimeGrid'
import { DayColumn, type DayColumnItem } from './DayColumn'
import { AllDayRow, type AllDayChip } from './AllDayRow'
import {
  weekDays,
  weekdayHeader,
  isSameDayAs,
  allDaySpansDay,
} from './dates'
import type { CalendarEvent } from './useCalendarEvents'

export interface CalendarGridProps {
  anchor: Date
  events: CalendarEvent[]
  members: MemberResponse[]
  now: Date
  onEventClick: (e: CalendarEvent) => void
  onSlotClick: (date: Date) => void
}

export function buildColorMap(members: MemberResponse[]): Map<string, string> {
  return new Map(members.map((m) => [m.id, memberColorHex(m.color)]))
}

function timedForDay(
  events: CalendarEvent[],
  day: Date,
  colors: Map<string, string>,
): DayColumnItem[] {
  return events
    .filter((e) => !e.isAllDay && e.start && isSameDayAs(e.start, day))
    .map((event) => ({ event, colorHex: colors.get(event.memberId) ?? '#888' }))
}

function allDayChipsForDay(
  events: CalendarEvent[],
  day: Date,
  colors: Map<string, string>,
  onEventClick: (e: CalendarEvent) => void,
): AllDayChip[] {
  return events
    .filter((e) => e.isAllDay && e.allDayStart && allDaySpansDay(e.allDayStart, e.allDayEnd, day))
    .map((event) => ({
      id: event.id,
      title: event.title,
      colorHex: colors.get(event.memberId) ?? '#888',
      onClick: () => onEventClick(event),
    }))
}

export function WeekGrid({
  anchor,
  events,
  members,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const days = weekDays(anchor)
  const colors = buildColorMap(members)

  return (
    <div>
      <div className="flex">
        <div className="w-12 shrink-0" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={`flex-1 py-1 text-center text-sm ${
              isSameDayAs(day, now) ? 'font-bold text-blue-400' : 'text-slate-300'
            }`}
          >
            {weekdayHeader(day)}
          </div>
        ))}
      </div>

      <AllDayRow
        columns={days.map((day) => allDayChipsForDay(events, day, colors, onEventClick))}
      />

      <TimeGrid>
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            timed={timedForDay(events, day, colors)}
            now={now}
            isToday={isSameDayAs(day, now)}
            onEventClick={onEventClick}
            onSlotClick={onSlotClick}
          />
        ))}
      </TimeGrid>
    </div>
  )
}
```

Create `frontend/src/features/calendar/DayGrid.tsx`:

```tsx
import { TimeGrid } from './TimeGrid'
import { DayColumn, type DayColumnItem } from './DayColumn'
import { AllDayRow, type AllDayChip } from './AllDayRow'
import { weekdayHeader, isSameDayAs, allDaySpansDay } from './dates'
import { buildColorMap, type CalendarGridProps } from './WeekGrid'
import type { CalendarEvent } from './useCalendarEvents'

export function DayGrid({
  anchor,
  events,
  members,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const colors = buildColorMap(members)

  const timed: DayColumnItem[] = events
    .filter((e) => !e.isAllDay && e.start && isSameDayAs(e.start, anchor))
    .map((event) => ({ event, colorHex: colors.get(event.memberId) ?? '#888' }))

  const chips: AllDayChip[] = events
    .filter(
      (e) => e.isAllDay && e.allDayStart && allDaySpansDay(e.allDayStart, e.allDayEnd, anchor),
    )
    .map((event: CalendarEvent) => ({
      id: event.id,
      title: event.title,
      colorHex: colors.get(event.memberId) ?? '#888',
      onClick: () => onEventClick(event),
    }))

  return (
    <div>
      <div className="flex">
        <div className="w-12 shrink-0" />
        <div
          className={`flex-1 py-1 text-center text-sm ${
            isSameDayAs(anchor, now) ? 'font-bold text-blue-400' : 'text-slate-300'
          }`}
        >
          {weekdayHeader(anchor)}
        </div>
      </div>

      <AllDayRow columns={[chips]} />

      <TimeGrid>
        <DayColumn
          day={anchor}
          timed={timed}
          now={now}
          isToday={isSameDayAs(anchor, now)}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
        />
      </TimeGrid>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/WeekGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/WeekGrid.tsx frontend/src/features/calendar/DayGrid.tsx frontend/src/features/calendar/WeekGrid.test.tsx
git commit -m "feat(calendar): add WeekGrid and DayGrid"
```

---

## Task 10: `MemberSelect` + `EventDialog` (create / edit / delete)

**Files:**
- Create: `frontend/src/features/calendar/MemberSelect.tsx`
- Create: `frontend/src/features/calendar/EventDialog.tsx`
- Test: `frontend/src/features/calendar/EventDialog.test.tsx`

**Interfaces:**
- Consumes: `memberColorHex` (`@/features/members/colors`); `useCreateEventMutation`, `useUpdateEventMutation`, `useDeleteEventMutation`, `CalendarEvent` (`./useCalendarEvents`); `formatTime` (`./dates`); `MemberResponse`, `EventCreateRequest` (model); `format` from `date-fns`.
- Produces:
  - `MemberSelect({ members, value, onChange }: { members: MemberResponse[]; value: string | null; onChange: (id: string) => void }): JSX.Element`
  - `EventDialog({ members, initial, defaultDate, onClose }: { members: MemberResponse[]; initial?: CalendarEvent | null; defaultDate?: Date; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/EventDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { EventDialog } from './EventDialog'
import type { MemberResponse } from '@/api/generated/model'

const createMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('./useCalendarEvents', async () => {
  const actual = await vi.importActual<typeof import('./useCalendarEvents')>('./useCalendarEvents')
  return {
    ...actual,
    useCreateEventMutation: () => ({ mutateAsync: createMock, isPending: false }),
    useUpdateEventMutation: () => ({ mutateAsync: updateMock, isPending: false }),
    useDeleteEventMutation: () => ({ mutateAsync: deleteMock, isPending: false }),
  }
})

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
]

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({})
  updateMock.mockReset().mockResolvedValue({})
  deleteMock.mockReset().mockResolvedValue({})
})

describe('EventDialog (create)', () => {
  it('requires title and member', async () => {
    renderWithProviders(<EventDialog members={members} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText(/Titel/)).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('creates a timed event with the selected member', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={onClose} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const arg = createMock.mock.calls[0][0].data
    expect(arg.memberId).toBe('m1')
    expect(arg.title).toBe('Zahnarzt')
    expect(arg.isAllDay).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('EventDialog (edit + delete)', () => {
  const existing = {
    id: 'e1',
    title: 'Schule',
    memberId: 'm1',
    isAllDay: false,
    start: new Date(2026, 6, 21, 9, 0),
    end: new Date(2026, 6, 21, 10, 0),
    allDayStart: null,
    allDayEnd: null,
    location: null,
    description: null,
  }

  it('deletes after confirmation', async () => {
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 'e1' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/EventDialog.test.tsx`
Expected: FAIL — cannot resolve `./EventDialog`.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/features/calendar/MemberSelect.tsx`:

```tsx
import type { MemberResponse } from '@/api/generated/model'
import { memberColorHex } from '@/features/members/colors'

export function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: MemberResponse[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-white">
      <span>Mitglied</span>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-label={m.name}
            aria-pressed={value === m.id}
            onClick={() => onChange(m.id)}
            className="rounded-full px-4 py-2 min-h-[44px] text-slate-900 font-medium"
            style={{
              backgroundColor: memberColorHex(m.color),
              outline: value === m.id ? '3px solid white' : 'none',
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  )
}
```

Create `frontend/src/features/calendar/EventDialog.tsx`:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import type { EventCreateRequest, MemberResponse } from '@/api/generated/model'
import { MemberSelect } from './MemberSelect'
import { formatTime } from './dates'
import {
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  type CalendarEvent,
} from './useCalendarEvents'

function isoFromParts(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

export function EventDialog({
  members,
  initial,
  defaultDate,
  onClose,
}: {
  members: MemberResponse[]
  initial?: CalendarEvent | null
  defaultDate?: Date
  onClose: () => void
}) {
  const editing = !!initial
  const baseDate = initial?.start ?? defaultDate ?? new Date()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [memberId, setMemberId] = useState<string | null>(initial?.memberId ?? null)
  const [isAllDay, setIsAllDay] = useState(initial?.isAllDay ?? false)
  const [date, setDate] = useState(
    format(initial?.start ?? (initial?.allDayStart ? new Date(initial.allDayStart) : baseDate), 'yyyy-MM-dd'),
  )
  const [startTime, setStartTime] = useState(initial?.start ? formatTime(initial.start) : formatTime(baseDate))
  const [endTime, setEndTime] = useState(
    initial?.end ? formatTime(initial.end) : formatTime(new Date(baseDate.getTime() + 60 * 60 * 1000)),
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const create = useCreateEventMutation()
  const update = useUpdateEventMutation()
  const remove = useDeleteEventMutation()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (title.trim().length === 0) {
      setError('Bitte gib einen Titel ein.')
      return
    }
    if (!memberId) {
      setError('Bitte wähle ein Mitglied.')
      return
    }
    if (!isAllDay && endTime <= startTime) {
      setError('Die Endzeit muss nach der Startzeit liegen.')
      return
    }

    const data: EventCreateRequest = isAllDay
      ? { memberId, title: title.trim(), isAllDay: true, allDayStart: date, allDayEnd: null, location: location || null, description: description || null }
      : { memberId, title: title.trim(), isAllDay: false, start: isoFromParts(date, startTime), end: isoFromParts(date, endTime), location: location || null, description: description || null }

    try {
      if (editing && initial) {
        await update.mutateAsync({ id: initial.id, data })
      } else {
        await create.mutateAsync({ data })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  async function doDelete() {
    if (!initial) return
    try {
      await remove.mutateAsync({ id: initial.id })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const isPending = create.isPending || update.isPending || remove.isPending

  return (
    <div
      role="dialog"
      aria-label={editing ? 'Termin bearbeiten' : 'Termin anlegen'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-slate-800 p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white">{editing ? 'Termin bearbeiten' : 'Termin anlegen'}</h2>

        <label className="flex flex-col gap-1 text-white">
          Titel
          <input
            aria-label="Titel"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <MemberSelect members={members} value={memberId} onChange={setMemberId} />

        <label className="flex items-center gap-2 text-white min-h-[44px]">
          <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
          Ganztägig
        </label>

        <label className="flex flex-col gap-1 text-white">
          Datum
          <input
            type="date"
            aria-label="Datum"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {!isAllDay && (
          <div className="flex gap-4">
            <label className="flex flex-1 flex-col gap-1 text-white">
              Von
              <input
                type="time"
                aria-label="Von"
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-white">
              Bis
              <input
                type="time"
                aria-label="Bis"
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1 text-white">
          Ort (optional)
          <input
            aria-label="Ort (optional)"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-white">
          Beschreibung (optional)
          <textarea
            aria-label="Beschreibung (optional)"
            className="rounded-lg px-3 py-2 text-slate-900"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex flex-wrap gap-3 justify-end">
          {editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mr-auto rounded-xl bg-red-700 px-4 py-3 min-h-[44px] text-white"
            >
              Löschen
            </button>
          )}
          {editing && confirmDelete && (
            <button
              type="button"
              onClick={doDelete}
              className="mr-auto rounded-xl bg-red-600 px-4 py-3 min-h-[44px] text-white"
            >
              Wirklich löschen
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-600 px-4 py-3 min-h-[44px] text-white"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-blue-500 px-4 py-3 min-h-[44px] text-white disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/EventDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/MemberSelect.tsx frontend/src/features/calendar/EventDialog.tsx frontend/src/features/calendar/EventDialog.test.tsx
git commit -m "feat(calendar): add EventDialog (create/edit/delete) and MemberSelect"
```

---

## Task 11: `CalendarHeader` (period label, view toggle, nav, sync, gear)

**Files:**
- Create: `frontend/src/features/calendar/CalendarHeader.tsx`
- Test: `frontend/src/features/calendar/CalendarHeader.test.tsx`

**Interfaces:**
- Consumes: `CalendarViewMode` (`./dates`); `lucide-react` icons.
- Produces:
  - `interface CalendarHeaderProps { label: string; view: CalendarViewMode; onViewChange: (v: CalendarViewMode) => void; onPrev: () => void; onNext: () => void; onToday: () => void; onSync: () => void; isSyncing: boolean; onOpenSettings: () => void }`
  - `CalendarHeader(props: CalendarHeaderProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/CalendarHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarHeader } from './CalendarHeader'

function setup(overrides = {}) {
  const props = {
    label: 'Juli 2026',
    view: 'week' as const,
    onViewChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onSync: vi.fn(),
    isSyncing: false,
    onOpenSettings: vi.fn(),
    ...overrides,
  }
  render(<CalendarHeader {...props} />)
  return props
}

describe('CalendarHeader', () => {
  it('shows the period label', () => {
    setup()
    expect(screen.getByText('Juli 2026')).toBeInTheDocument()
  })
  it('switches to day view', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(props.onViewChange).toHaveBeenCalledWith('day')
  })
  it('navigates and jumps to today', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Heute' }))
    expect(props.onPrev).toHaveBeenCalled()
    expect(props.onNext).toHaveBeenCalled()
    expect(props.onToday).toHaveBeenCalled()
  })
  it('triggers sync and settings', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Synchronisieren' }))
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(props.onSync).toHaveBeenCalled()
    expect(props.onOpenSettings).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/CalendarHeader.test.tsx`
Expected: FAIL — cannot resolve `./CalendarHeader`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/CalendarHeader.tsx`:

```tsx
import { ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import type { CalendarViewMode } from './dates'

export interface CalendarHeaderProps {
  label: string
  view: CalendarViewMode
  onViewChange: (v: CalendarViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSync: () => void
  isSyncing: boolean
  onOpenSettings: () => void
}

const BTN = 'rounded-xl bg-slate-700 px-4 py-3 min-h-[44px] min-w-[44px] text-white'

export function CalendarHeader({
  label,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onSync,
  isSyncing,
  onOpenSettings,
}: CalendarHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 p-4">
      <h1 className="text-2xl font-bold text-white mr-auto">{label}</h1>

      <div className="flex overflow-hidden rounded-xl">
        {(['day', 'week'] as CalendarViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onViewChange(v)}
            className={`px-4 py-3 min-h-[44px] text-white ${view === v ? 'bg-blue-500' : 'bg-slate-700'}`}
          >
            {v === 'day' ? 'Tag' : 'Woche'}
          </button>
        ))}
      </div>

      <button type="button" aria-label="Vorheriger Zeitraum" onClick={onPrev} className={BTN}>
        <ChevronLeft aria-hidden />
      </button>
      <button type="button" onClick={onToday} className={BTN}>
        Heute
      </button>
      <button type="button" aria-label="Nächster Zeitraum" onClick={onNext} className={BTN}>
        <ChevronRight aria-hidden />
      </button>

      <button
        type="button"
        aria-label="Synchronisieren"
        onClick={onSync}
        disabled={isSyncing}
        className={`${BTN} disabled:opacity-50`}
      >
        <RefreshCw aria-hidden className={isSyncing ? 'animate-spin' : ''} />
      </button>
      <button type="button" aria-label="Einstellungen" onClick={onOpenSettings} className={BTN}>
        <Settings aria-hidden />
      </button>
    </header>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/CalendarHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/CalendarHeader.tsx frontend/src/features/calendar/CalendarHeader.test.tsx
git commit -m "feat(calendar): add CalendarHeader"
```

---

## Task 12: `CalendarView` (container: state, data, dialog, sync, errors)

**Files:**
- Create: `frontend/src/features/calendar/CalendarView.tsx`
- Test: `frontend/src/features/calendar/CalendarView.test.tsx`

**Interfaces:**
- Consumes: `useNavigate` (react-router); `useMembers`; `useCalendarEvents`, `CalendarEvent`; `useCalendarSync`; `WeekGrid`, `DayGrid`; `CalendarHeader`; `EventDialog`; `periodLabel`, `shiftAnchor`, `CalendarViewMode` (`./dates`).
- Produces: `CalendarView(): JSX.Element`. Holds `view`, `anchor`, ticking `now` (60 s), and dialog state (`{ mode: 'create', date } | { mode: 'edit', event } | null`). Renders header + grid + loading/error banner + dialog.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/calendar/CalendarView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { CalendarView } from './CalendarView'
import type { MemberResponse } from '@/api/generated/model'

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
]

vi.mock('@/features/members/useMembersQuery', () => ({
  useMembers: () => ({ members, isLoading: false, isError: false }),
}))

const eventsRef = { current: { events: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() } }
vi.mock('./useCalendarEvents', async () => {
  const actual = await vi.importActual<typeof import('./useCalendarEvents')>('./useCalendarEvents')
  return { ...actual, useCalendarEvents: () => eventsRef.current }
})

const syncMock = vi.fn()
vi.mock('./useCalendarSync', () => ({
  useCalendarSync: () => ({ sync: syncMock, isSyncing: false, isError: false }),
}))

beforeEach(() => {
  eventsRef.current = { events: [], isLoading: false, isError: false, refetch: vi.fn() }
  syncMock.mockReset()
})

describe('CalendarView', () => {
  it('renders the current period label and week grid by default', () => {
    renderWithProviders(<CalendarView />)
    // week headers exist (7 columns)
    expect(screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d/).length).toBe(7)
  })

  it('switches to day view', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d/).length).toBe(1)
  })

  it('shows an error banner with retry when loading fails', async () => {
    const refetch = vi.fn()
    eventsRef.current = { events: [], isLoading: false, isError: true, refetch }
    renderWithProviders(<CalendarView />)
    expect(screen.getByText('Fehler beim Laden der Termine')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('triggers sync from the header', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Synchronisieren' }))
    expect(syncMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- --run src/features/calendar/CalendarView.test.tsx`
Expected: FAIL — cannot resolve `./CalendarView`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/features/calendar/CalendarView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers } from '@/features/members/useMembersQuery'
import { CalendarHeader } from './CalendarHeader'
import { WeekGrid } from './WeekGrid'
import { DayGrid } from './DayGrid'
import { EventDialog } from './EventDialog'
import { useCalendarEvents, type CalendarEvent } from './useCalendarEvents'
import { useCalendarSync } from './useCalendarSync'
import { periodLabel, shiftAnchor, type CalendarViewMode } from './dates'

type DialogState =
  | { mode: 'create'; date: Date }
  | { mode: 'edit'; event: CalendarEvent }
  | null

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function CalendarView() {
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [view, setView] = useState<CalendarViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [dialog, setDialog] = useState<DialogState>(null)

  const { members } = useMembers()
  const { events, isLoading, isError, refetch } = useCalendarEvents(anchor, view)
  const sync = useCalendarSync()

  const gridProps = {
    anchor,
    events,
    members,
    now,
    onEventClick: (event: CalendarEvent) => setDialog({ mode: 'edit', event }),
    onSlotClick: (date: Date) => setDialog({ mode: 'create', date }),
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <CalendarHeader
        label={periodLabel(anchor)}
        view={view}
        onViewChange={setView}
        onPrev={() => setAnchor((a) => shiftAnchor(a, view, -1))}
        onNext={() => setAnchor((a) => shiftAnchor(a, view, 1))}
        onToday={() => setAnchor(new Date())}
        onSync={() => void sync.sync()}
        isSyncing={sync.isSyncing}
        onOpenSettings={() => navigate('/settings')}
      />

      {(isError || sync.isError) && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-red-900/60 p-3">
          <span className="text-red-200">Fehler beim Laden der Termine</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-red-700 px-3 py-2 min-h-[44px] text-white"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && <p className="px-4 py-2 text-slate-400">Termine werden geladen …</p>}

      <div className="overflow-y-auto px-2 pb-4">
        {view === 'week' ? <WeekGrid {...gridProps} /> : <DayGrid {...gridProps} />}
      </div>

      {dialog && (
        <EventDialog
          members={members}
          initial={dialog.mode === 'edit' ? dialog.event : null}
          defaultDate={dialog.mode === 'create' ? dialog.date : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- --run src/features/calendar/CalendarView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/calendar/CalendarView.tsx frontend/src/features/calendar/CalendarView.test.tsx
git commit -m "feat(calendar): add CalendarView container"
```

---

## Task 13: `AppShell` + routing (calendar at `/`, settings at `/settings`)

**Files:**
- Create: `frontend/src/routing/AppShell.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/features/settings/SettingsView.tsx` (add a back-to-calendar link)
- Test: `frontend/src/App.test.tsx`
- Test: `frontend/src/routing/AppShell.test.tsx`

**Interfaces:**
- Consumes: `SetupGuard`; `CalendarView`; `SettingsView`; react-router.
- Produces:
  - `AppShell({ children }: { children: ReactNode }): JSX.Element` — minimal shell frame (full-height background) prepared for future section navigation; renders `children`.
  - `App` routes: `/` → `AppShell > CalendarView` (behind `SetupGuard`); `/settings` → `AppShell > SettingsView` (behind `SetupGuard`); `/setup`, `/oauth/callback` unchanged.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/routing/AppShell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })
})
```

Create `frontend/src/App.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/routing/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/calendar/CalendarView', () => ({
  CalendarView: () => <div>KALENDER</div>,
}))
vi.mock('@/features/settings/SettingsView', () => ({
  SettingsView: () => <div>EINSTELLUNGEN</div>,
}))
vi.mock('@/features/setup/SetupWizard', () => ({ SetupWizard: () => <div>SETUP</div> }))
vi.mock('@/features/google/OAuthCallback', () => ({ OAuthCallback: () => <div>CALLBACK</div> }))

// App renders its own BrowserRouter; import after mocks.
import AppRoutes from './App'

describe('App routing', () => {
  it('shows the calendar at /', () => {
    // Render only the routes by reusing renderWithProviders which supplies a router;
    // App uses BrowserRouter internally, so we assert on default path content.
    renderWithProviders(<AppRoutes />)
    expect(screen.getByText('KALENDER')).toBeInTheDocument()
  })
})
```

> Note: `App` wraps routes in its own `BrowserRouter`. `renderWithProviders` also mounts a `MemoryRouter`, but nested routers are tolerated here because we only assert the `/` route content (jsdom default URL is `/`). If a nested-router warning causes a failure, change this test to import and render the inner routes; keep the assertion `getByText('KALENDER')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- --run src/routing/AppShell.test.tsx src/App.test.tsx`
Expected: FAIL — `./AppShell` missing and `/` still renders settings.

- [ ] **Step 3: Write the implementations**

Create `frontend/src/routing/AppShell.tsx`:

```tsx
import { type ReactNode } from 'react'

/**
 * Minimal application frame. Prepared for a future section navigation
 * (Aufgaben/Haushalt/Fotos); in Schritt 4 it only frames the page content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-900">{children}</div>
}
```

Replace `frontend/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SetupGuard } from '@/routing/SetupGuard'
import { AppShell } from '@/routing/AppShell'
import NotFound from '@/routing/NotFound'
import { SetupWizard } from '@/features/setup/SetupWizard'
import { CalendarView } from '@/features/calendar/CalendarView'
import { SettingsView } from '@/features/settings/SettingsView'
import { OAuthCallback } from '@/features/google/OAuthCallback'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/"
          element={
            <SetupGuard>
              <AppShell>
                <CalendarView />
              </AppShell>
            </SetupGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <SetupGuard>
              <AppShell>
                <SettingsView />
              </AppShell>
            </SetupGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
```

Add a back-to-calendar link in `frontend/src/features/settings/SettingsView.tsx`. Add the import at the top:

```tsx
import { Link } from 'react-router-dom'
```

And insert directly after the opening `<div className="max-w-4xl mx-auto flex flex-col gap-6">` (before the `<h1>`):

```tsx
        <Link to="/" className="self-start text-blue-400 min-h-[44px] flex items-center">
          ← Zum Kalender
        </Link>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- --run src/routing/AppShell.test.tsx src/App.test.tsx`
Expected: PASS. Also re-run the existing settings test:
Run: `cd frontend && npm test -- --run src/features/settings/SettingsView.test.tsx`
Expected: PASS (the added link does not break existing assertions).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routing/AppShell.tsx frontend/src/App.tsx frontend/src/features/settings/SettingsView.tsx frontend/src/routing/AppShell.test.tsx frontend/src/App.test.tsx
git commit -m "feat(app): make calendar the start page, settings at /settings via AppShell"
```

---

## Task 14: End-to-end flow (Playwright)

**Files:**
- Create: `frontend/e2e/calendar.spec.ts`

**Interfaces:**
- Consumes: running dev server (Playwright `webServer` config already present). Mocks all `/api/v1/*` routes with an in-memory events array.
- Produces: an E2E spec covering open → create → visible → edit → delete.

- [ ] **Step 1: Write the E2E spec**

Create `frontend/e2e/calendar.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

type Event = {
  id: string
  title: string
  memberId: string
  calendarId: string
  isAllDay: boolean
  start?: string
  end?: string
}

test('create, edit and delete a calendar event', async ({ page }) => {
  const events: Event[] = []
  let nextId = 1

  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
      ]),
    }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // list + create events
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const created: Event = { id: String(nextId++), calendarId: 'c1', ...body }
      events.push(created)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  // update + delete events
  await page.route(/\/api\/v1\/events\/[^/?]+$/, (route) => {
    const req = route.request()
    const id = req.url().split('/').pop()!.split('?')[0]
    const idx = events.findIndex((e) => e.id === id)
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() ?? '{}')
      if (idx >= 0) events[idx] = { ...events[idx], ...body }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events[idx]) })
    }
    if (req.method() === 'DELETE') {
      if (idx >= 0) events.splice(idx, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })

  await page.goto('/')

  // Create: open dialog via an empty slot
  await page.getByLabel('Neuer Termin 08:00').first().click()
  await page.getByLabel('Titel').fill('Zahnarzt')
  await page.getByRole('button', { name: 'Anna' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Visible in the grid
  await expect(page.getByRole('button', { name: /Zahnarzt/ })).toBeVisible()

  // Edit
  await page.getByRole('button', { name: /Zahnarzt/ }).click()
  await page.getByLabel('Titel').fill('Zahnarzt Kontrolle')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('button', { name: /Zahnarzt Kontrolle/ })).toBeVisible()

  // Delete (two-step confirm)
  await page.getByRole('button', { name: /Zahnarzt Kontrolle/ }).click()
  await page.getByRole('button', { name: 'Löschen' }).click()
  await page.getByRole('button', { name: 'Wirklich löschen' }).click()
  await expect(page.getByRole('button', { name: /Zahnarzt/ })).toHaveCount(0)
})
```

- [ ] **Step 2: Run the E2E spec**

Run: `cd frontend && npm run test:e2e -- calendar.spec.ts`
Expected: PASS. If the dev server is not auto-started, ensure `playwright.config.ts` `webServer` runs `npm run dev`; run once to confirm the flow.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/calendar.spec.ts
git commit -m "test(calendar): e2e create/edit/delete event flow"
```

---

## Task 15: Full gate + coverage sweep

**Files:** none new — this task runs the full quality gate and fixes any fallout.

- [ ] **Step 1: Run the whole frontend gate**

Run: `cd frontend && npm run check`
Expected: PASS — `tsc --noEmit`, `eslint --max-warnings 0`, dependency-cruiser (no orphans/cycles), and coverage thresholds all green.

- [ ] **Step 2: Fix any coverage gaps**

If coverage fails on a specific calendar module, add the missing unit test to that module's colocated `*.test.ts(x)` (favor `layout.ts`/`dates.ts` edge cases first — they are cheap and high-value). Re-run `npm run check` until green.

- [ ] **Step 3: Run the repo pre-commit mirror**

Run: `bash scripts/pre-commit-check.sh`
Expected: backend `./gradlew check` (unchanged — no backend edits) and frontend `npm run check` both PASS.

- [ ] **Step 4: Commit any test/config additions**

```bash
git add -A
git commit -m "test(calendar): close coverage gaps for calendar feature"
```

---

## Spec Coverage Map (self-review)

| Spec section / requirement | Task |
|---|---|
| App-Shell & routing (`/` calendar, `/settings`) — §1 | 13 |
| CalendarHeader: label `FA-KAL-05`, view toggle, nav `FA-KAL-03`, Heute `FA-KAL-04`, sync, gear | 11, 12 |
| Feature-slice file structure — §2 | 1–13 |
| Grid math 06–22 / 50px, clamp, overlap columns `FA-KAL-02/07` — §3 | 2 |
| All-day handling in AllDayRow `FA-KAL-11` — §3/§4 | 6, 9 |
| Week 7 columns Mon–Sun `FA-KAL-01`, today highlight `FA-KAL-10` — §4 | 8, 9 |
| Now-line 60s, hidden outside hours `FA-KAL-09` — §4 | 7, 8, 12 |
| Day view `FA-KAL-06` — §4 | 9, 12 |
| Data loading by visible range — §5 | 4, 12 |
| Event dialog create/edit/delete `FA-KAL-16/17/18` — §6 | 10 |
| Member-select drives color + target calendar — §6 | 10 |
| Slot click → create prefilled; block click → edit — §6 | 8, 12 |
| Sync all connected members `FA-KAL-19` — §7 | 5, 12 |
| Loading + error banner + retry `FA-KAL-20` — §7 | 12 |
| German UI, touch ≥44px, de formatting `FA-ALLG-03` — §8 | all (Global Constraints) |
| TDD unit/component/e2e — §9 | all + 14 |
| Member color reuse from `colors.ts` — §2 | 3 |

Deviation note: `DayColumn.tsx` is introduced (not in the spec's §2 file list) as a DRY building block shared by `WeekGrid` and `DayGrid`, consistent with the spec's intent that both views "share the same TimeGrid building blocks."

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-27-schritt4-kalenderansicht.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
