import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekGrid } from './WeekGrid'
import { DayGrid } from './DayGrid'
import type { CalendarEvent } from './useCalendarEvents'

const anchor = new Date(2026, 6, 22, 12) // Wed in week Mon 20 – Sun 26
const calendarColors = new Map<string, string>([['cal-a', 'hsl(140 60% 65%)']])

const base = {
  memberId: 'm1',
  location: null,
  description: null,
  reminderUseDefault: true,
  reminderMinutes: null,
  recurringEventId: null,
}

const timed: CalendarEvent = {
  ...base, id: 'e1', title: 'Schule', calendarId: 'cal-a', isAllDay: false,
  start: new Date(2026, 6, 21, 9), end: new Date(2026, 6, 21, 10), allDayStart: null, allDayEnd: null,
}

const allDay: CalendarEvent = {
  ...base, id: 'e2', title: 'Urlaub Papa', calendarId: 'cal-a', isAllDay: true,
  start: null, end: null, allDayStart: '2026-07-21', allDayEnd: null,
}

describe('WeekGrid', () => {
  it('renders 7 weekday headers Monday..Sunday', () => {
    render(<WeekGrid anchor={anchor} events={[]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByText(/Mo 20/)).toBeInTheDocument()
    expect(screen.getByText(/So 26/)).toBeInTheDocument()
  })

  it('colors a timed event by its calendar color', () => {
    render(<WeekGrid anchor={anchor} events={[timed]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toHaveStyle({ backgroundColor: 'hsl(140 60% 65%)' })
  })

  it('falls back to grey for an event whose calendar is unknown', () => {
    render(<WeekGrid anchor={anchor} events={[{ ...timed, calendarId: 'ghost' }]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toHaveStyle({ backgroundColor: '#888' })
  })

  it('renders an all-day event as a chip and fires onEventClick', async () => {
    const onEventClick = vi.fn()
    render(<WeekGrid anchor={anchor} events={[allDay]} calendarColors={calendarColors} now={anchor} onEventClick={onEventClick} onSlotClick={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Urlaub Papa' }))
    expect(onEventClick).toHaveBeenCalledWith(allDay)
  })

  it('excludes a non-all-day event that has no start time', () => {
    render(<WeekGrid anchor={anchor} events={[{ ...timed, start: null }]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Schule/ })).toBeNull()
  })

  it('falls back to grey for an all-day chip whose calendar is unknown', () => {
    render(<WeekGrid anchor={anchor} events={[{ ...allDay, calendarId: 'ghost' }]} calendarColors={calendarColors} now={anchor} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Urlaub Papa' })).toHaveStyle({ backgroundColor: '#888' })
  })
})

describe('DayGrid', () => {
  it('renders a single day and its timed event', () => {
    render(<DayGrid anchor={new Date(2026, 6, 21, 12)} events={[timed]} calendarColors={calendarColors} now={new Date(2026, 6, 21, 12)} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Schule/ })).toBeInTheDocument()
  })

  it('does not bold the weekday header when anchor is not today', () => {
    render(<DayGrid anchor={new Date(2026, 6, 21, 12)} events={[]} calendarColors={calendarColors} now={new Date(2026, 6, 22, 12)} onEventClick={vi.fn()} onSlotClick={vi.fn()} />)
    const header = screen.getByText(/Di 21/)
    expect(header).toHaveClass('text-slate-300')
    expect(header).not.toHaveClass('font-bold')
    expect(header).not.toHaveClass('text-blue-400')
  })
})
