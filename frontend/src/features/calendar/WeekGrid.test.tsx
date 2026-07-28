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
