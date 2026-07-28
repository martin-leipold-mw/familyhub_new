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
