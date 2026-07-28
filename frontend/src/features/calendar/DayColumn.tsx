import { HOURS, HOUR_PX, layoutDay, type Positioned } from './layout'
import { EventBlock } from './EventBlock'
import { CurrentTimeLine } from './CurrentTimeLine'
import { formatTime } from './dates'
import type { CalendarEvent } from './useCalendarEvents'

export interface DayColumnItem {
  event: CalendarEvent
  colorHex: string
}

export interface DayColumnProps {
  day: Date
  timed: DayColumnItem[]
  now: Date
  isToday: boolean
  onEventClick: (e: CalendarEvent) => void
  onSlotClick: (date: Date) => void
}

export function DayColumn({
  day,
  timed,
  now,
  isToday,
  onEventClick,
  onSlotClick,
}: DayColumnProps) {
  const withTimes = timed.filter((t) => t.event.start && t.event.end)
  const positions = layoutDay(
    withTimes.map((t) => ({ id: t.event.id, start: t.event.start!, end: t.event.end! })),
  )
  const posById = new Map<string, Positioned>(positions.map((p) => [p.id, p]))

  return (
    <div
      className={`relative flex-1 border-l border-slate-700 ${isToday ? 'bg-blue-500/10' : ''}`}
    >
      {/* clickable empty hour slots */}
      {HOURS.slice(0, -1).map((h, i) => (
        <button
          key={h}
          type="button"
          aria-label={`Neuer Termin ${String(h).padStart(2, '0')}:00`}
          onClick={() => {
            const d = new Date(day)
            d.setHours(h, 0, 0, 0)
            onSlotClick(d)
          }}
          className="absolute left-0 right-0 block"
          style={{ top: i * HOUR_PX, height: HOUR_PX }}
        />
      ))}

      {withTimes.map((t) => {
        const p = posById.get(t.event.id)
        if (!p) return null
        return (
          <EventBlock
            key={t.event.id}
            title={t.event.title}
            timeLabel={formatTime(t.event.start!)}
            colorHex={t.colorHex}
            top={p.top}
            height={p.height}
            leftPct={p.leftPct}
            widthPct={p.widthPct}
            onClick={() => onEventClick(t.event)}
          />
        )
      })}

      {isToday && <CurrentTimeLine now={now} />}
    </div>
  )
}
