import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { allDaySpansDay, formatTime } from './dates'
import { buildColorMap } from './WeekGrid'
import type { CalendarGridProps } from './WeekGrid'
import type { CalendarEvent } from './useCalendarEvents'

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((e) =>
      e.isAllDay
        ? e.allDayStart != null && allDaySpansDay(e.allDayStart, e.allDayEnd, day)
        : e.start != null && isSameDay(e.start, day),
    )
    .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))
}

export function AgendaList({ events, members, now, onEventClick }: CalendarGridProps) {
  const colors = buildColorMap(members)
  const first = startOfDay(now)
  const days = Array.from({ length: 31 }, (_, i) => addDays(first, i))
  const grouped = days
    .map((day) => ({ day, dayEvents: eventsForDay(events, day) }))
    .filter((g) => g.dayEvents.length > 0)

  if (grouped.length === 0) {
    return <p className="px-4 py-8 text-slate-400">Keine Termine in den nächsten 30 Tagen.</p>
  }

  return (
    <div className="flex flex-col gap-4 px-2">
      {grouped.map(({ day, dayEvents }) => (
        <section key={day.toISOString()}>
          <h2
            className={`px-2 py-2 text-lg font-bold ${
              isSameDay(day, now) ? 'text-blue-400' : 'text-slate-300'
            }`}
          >
            {format(day, 'EEEE, d. MMMM', { locale: de })}
          </h2>
          <ul className="flex flex-col gap-2">
            {dayEvents.map((e) => {
              const color = colors.get(e.memberId) ?? '#888'
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onEventClick(e)}
                    className="flex w-full items-center gap-3 rounded-xl bg-slate-800 px-3 py-3 min-h-[44px] text-left"
                  >
                    <span className="h-8 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="w-28 shrink-0 text-slate-300">
                      {e.isAllDay ? 'Ganztägig' : e.start ? formatTime(e.start) : ''}
                    </span>
                    <span className="truncate font-medium text-white">{e.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
