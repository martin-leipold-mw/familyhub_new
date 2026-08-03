import { TimeGrid } from './TimeGrid'
import { DayColumn } from './DayColumn'
import { AllDayRow } from './AllDayRow'
import { weekdayHeader, isSameDayAs } from './dates'
import {
  timedForDay,
  allDayChipsForDay,
  type CalendarGridProps,
} from './WeekGrid'

export function DayGrid({
  anchor,
  events,
  calendarColors,
  now,
  onEventClick,
  onSlotClick,
}: CalendarGridProps) {
  const colors = calendarColors

  const timed = timedForDay(events, anchor, colors)

  const chips = allDayChipsForDay(events, anchor, colors, onEventClick)

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
