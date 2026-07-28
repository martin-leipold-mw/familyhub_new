import {
  startOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  format,
  isSameDay,
} from 'date-fns'
import { de } from 'date-fns/locale'

export type CalendarViewMode = 'week' | 'day'

export interface VisibleRange {
  start: Date
  end: Date
}

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function visibleRange(anchor: Date, view: CalendarViewMode): VisibleRange {
  if (view === 'day') {
    return { start: startOfDay(anchor), end: endOfDay(anchor) }
  }
  const days = weekDays(anchor)
  return { start: startOfDay(days[0]), end: endOfDay(days[6]) }
}

export function shiftAnchor(anchor: Date, view: CalendarViewMode, dir: 1 | -1): Date {
  return view === 'day' ? addDays(anchor, dir) : addDays(anchor, dir * 7)
}

export function rangeParams(range: VisibleRange): { start: string; end: string } {
  return { start: range.start.toISOString(), end: range.end.toISOString() }
}

export function periodLabel(anchor: Date): string {
  return format(anchor, 'MMMM yyyy', { locale: de })
}

export function weekdayHeader(day: Date): string {
  return format(day, 'EEEEEE dd', { locale: de })
}

export function dayNumber(day: Date): string {
  return format(day, 'd')
}

export function isSameDayAs(a: Date, b: Date): boolean {
  return isSameDay(a, b)
}

export function formatTime(d: Date): string {
  return format(d, 'HH:mm')
}

export function allDaySpansDay(start: string, end: string | null, day: Date): boolean {
  const key = format(day, 'yyyy-MM-dd')
  if (!end) return key === start
  return key >= start && key < end
}
