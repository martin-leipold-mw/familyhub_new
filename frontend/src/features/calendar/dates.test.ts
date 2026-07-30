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
  agendaRange,
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
    expect(spanDays).toBe(7)
  })
})
