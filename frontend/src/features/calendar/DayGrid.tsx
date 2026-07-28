import { TimeGrid } from './TimeGrid'
import { DayColumn, type DayColumnItem } from './DayColumn'
import { AllDayRow, type AllDayChip } from './AllDayRow'
import { weekdayHeader, isSameDayAs, allDaySpansDay } from './dates'
import { buildColorMap, type CalendarGridProps } from './WeekGrid'
import type { CalendarEvent } from './useCalendarEvents'

export function DayGrid({
  anchor,
  events,
  members,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const colors = buildColorMap(members)

  const timed: DayColumnItem[] = events
    .filter((e) => !e.isAllDay && e.start && isSameDayAs(e.start, anchor))
    .map((event) => ({ event, colorHex: colors.get(event.memberId) ?? '#888' }))

  const chips: AllDayChip[] = events
    .filter(
      (e) => e.isAllDay && e.allDayStart && allDaySpansDay(e.allDayStart, e.allDayEnd, anchor),
    )
    .map((event: CalendarEvent) => ({
      id: event.id,
      title: event.title,
      colorHex: colors.get(event.memberId) ?? '#888',
      onClick: () => onEventClick(event),
    }))

  return (
    <div>
      <div className="flex">
        <div className="w-12 shrink-0" />
        <div
          className={`flex-1 py-1 text-center text-sm ${
            isSameDayAs(anchor, now) ? 'font-bold text-blue-400' : 'text-slate-300'
          }`}
        >
          {weekdayHeader(anchor)}
        </div>
      </div>

      <AllDayRow columns={[chips]} />

      <TimeGrid>
        <DayColumn
          day={anchor}
          timed={timed}
          now={now}
          isToday={isSameDayAs(anchor, now)}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
        />
      </TimeGrid>
    </div>
  )
}
