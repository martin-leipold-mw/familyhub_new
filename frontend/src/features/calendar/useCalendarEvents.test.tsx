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
