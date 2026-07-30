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
