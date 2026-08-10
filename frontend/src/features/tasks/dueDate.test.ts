import { describe, it, expect, afterEach, vi } from 'vitest'
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

describe('formatDueDate across the UTC/local midnight boundary', () => {
  // In timezones east of UTC (e.g. CEST, UTC+2 — this product's deployment on
  // a wall-mounted display), the window between local midnight and UTC
  // midnight (00:00–02:00 CEST) is already on the *next* UTC calendar day.
  // `daysBetween` must derive "today" from the local calendar day, not the
  // UTC one, or the display mislabels tasks for two hours every night.
  // `Etc/GMT-2` is a fixed UTC+2 offset with no DST, chosen so this test is
  // deterministic regardless of the host/CI machine's own timezone.
  const divergentInstant = new Date('2026-08-07T23:00:00Z') // 2026-08-08T01:00 local (UTC+2)

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('labels a task due on the local day as "Heute" even while the UTC day is still yesterday', () => {
    vi.stubEnv('TZ', 'Etc/GMT-2')
    expect(formatDueDate('2026-08-08', divergentInstant)).toEqual({ text: 'Heute', tone: 'urgent' })
  })

  it('labels a task due on the day before the local day as "Überfällig"', () => {
    vi.stubEnv('TZ', 'Etc/GMT-2')
    expect(formatDueDate('2026-08-07', divergentInstant)).toEqual({
      text: 'Überfällig',
      tone: 'overdue',
    })
  })
})
