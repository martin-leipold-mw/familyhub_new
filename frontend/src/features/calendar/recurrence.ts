export type Frequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'until'; date: string }
  | { type: 'count'; count: number }

export interface RecurrenceState {
  frequency: Frequency
  interval: number
  weekdays: WeekdayCode[]
  end: RecurrenceEnd
}

export const EMPTY_RECURRENCE: RecurrenceState = {
  frequency: 'none',
  interval: 1,
  weekdays: [],
  end: { type: 'never' },
}

const FREQ: Record<Exclude<Frequency, 'none'>, string> = {
  daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY',
}
const FREQ_REVERSE: Record<string, Frequency> = {
  DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly',
}

export function buildRrule(state: RecurrenceState, opts: { isAllDay: boolean }): string | null {
  if (state.frequency === 'none') return null
  const parts = [`FREQ=${FREQ[state.frequency]}`, `INTERVAL=${state.interval}`]
  if (state.frequency === 'weekly' && state.weekdays.length > 0) {
    parts.push(`BYDAY=${state.weekdays.join(',')}`)
  }
  if (state.end.type === 'until') {
    const compact = state.end.date.replace(/-/g, '')
    parts.push(`UNTIL=${opts.isAllDay ? compact : `${compact}T235959Z`}`)
  } else if (state.end.type === 'count') {
    parts.push(`COUNT=${state.end.count}`)
  }
  return `RRULE:${parts.join(';')}`
}

export function parseRrule(rule: string | null): RecurrenceState {
  if (!rule) return EMPTY_RECURRENCE
  const body = rule.replace(/^RRULE:/, '')
  const map = new Map<string, string>()
  for (const kv of body.split(';')) {
    const [k, v] = kv.split('=')
    if (k && v) map.set(k, v)
  }
  const frequency = FREQ_REVERSE[map.get('FREQ') ?? ''] ?? 'none'
  if (frequency === 'none') return EMPTY_RECURRENCE
  const interval = Number(map.get('INTERVAL') ?? '1')
  const weekdays = (map.get('BYDAY')?.split(',') as WeekdayCode[]) ?? []
  let end: RecurrenceEnd = { type: 'never' }
  if (map.has('COUNT')) {
    end = { type: 'count', count: Number(map.get('COUNT')) }
  } else if (map.has('UNTIL')) {
    const u = map.get('UNTIL')!.slice(0, 8) // YYYYMMDD
    end = { type: 'until', date: `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` }
  }
  return { frequency, interval, weekdays, end }
}
