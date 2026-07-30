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
  reminderUseDefault: true,
  reminderMinutes: null,
  recurringEventId: null,
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

  it('silently drops an event that layoutDay filters out as fully outside the visible window', () => {
    const outsideEvent: CalendarEvent = {
      ...timedEvent,
      id: 'e-outside',
      title: 'Mitternachtstermin',
      start: new Date(2026, 6, 21, 2, 0),
      end: new Date(2026, 6, 21, 3, 0),
    }
    render(
      <DayColumn
        day={day}
        timed={[{ event: outsideEvent, colorHex: '#abc' }]}
        now={new Date(2026, 6, 21, 12, 0)}
        isToday={false}
        onEventClick={vi.fn()}
        onSlotClick={vi.fn()}
      />,
    )
    expect(screen.queryByText('Mitternachtstermin')).toBeNull()
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
