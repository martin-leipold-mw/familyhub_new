import { describe, it, expect } from 'vitest'
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
