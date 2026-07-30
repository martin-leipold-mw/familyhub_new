import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgendaList } from './AgendaList'
import type { CalendarEvent } from './useCalendarEvents'
import type { MemberResponse } from '@/api/generated/model'

const now = new Date('2026-07-30T09:00:00')

const members: MemberResponse[] = [
  {
    id: 'm1',
    name: 'Anna',
    role: 'parent',
    color: 'blue',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
]

function timed(id: string, iso: string): CalendarEvent {
  return {
    id,
    title: `E-${id}`,
    memberId: 'm1',
    isAllDay: false,
    start: new Date(iso),
    end: new Date(iso),
    allDayStart: null,
    allDayEnd: null,
    location: null,
    description: null,
    reminderUseDefault: true,
    reminderMinutes: null,
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

it('shows an all-day event that spans into a day', () => {
  const spanning: CalendarEvent = {
    id: 'span',
    title: 'Urlaub',
    memberId: 'm1',
    isAllDay: true,
    start: null,
    end: null,
    allDayStart: '2026-07-29',
    allDayEnd: '2026-07-31',
    location: null,
    description: null,
    reminderUseDefault: true,
    reminderMinutes: null,
  }
  render(<AgendaList {...base} events={[spanning]} onEventClick={() => {}} />)
  expect(screen.getByText('Urlaub')).toBeInTheDocument()
  expect(screen.getByText('Ganztägig')).toBeInTheDocument()
})

it('sorts a day with all-day and timed events: all-day first, then by start time', () => {
  const spanning: CalendarEvent = {
    id: 'span',
    title: 'Urlaub',
    memberId: 'm1',
    isAllDay: true,
    start: null,
    end: null,
    allDayStart: '2026-07-30',
    allDayEnd: null,
    location: null,
    description: null,
    reminderUseDefault: true,
    reminderMinutes: null,
  }
  const events = [
    timed('late', '2026-07-30T14:00:00'),
    spanning,
    timed('early', '2026-07-30T09:00:00'),
  ]
  render(<AgendaList {...base} events={events} onEventClick={() => {}} />)
  const titles = screen.getAllByText(/^(E-|Urlaub)/).map((el) => el.textContent)
  expect(titles).toEqual(['Urlaub', 'E-early', 'E-late'])
})

it('falls back to a default color when the member is unknown', () => {
  const event: CalendarEvent = {
    id: 'x',
    title: 'E-x',
    memberId: 'unknown',
    isAllDay: false,
    start: new Date('2026-07-30T10:00:00'),
    end: null,
    allDayStart: null,
    allDayEnd: null,
    location: null,
    description: null,
    reminderUseDefault: true,
    reminderMinutes: null,
  }
  const { container } = render(<AgendaList {...base} events={[event]} onEventClick={() => {}} />)
  const swatch = container.querySelector('.rounded-full') as HTMLElement
  expect(swatch.style.backgroundColor).toBe('rgb(136, 136, 136)')
})
