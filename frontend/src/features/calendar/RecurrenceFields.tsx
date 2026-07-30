import { getDay, format } from 'date-fns'
import type { Frequency, RecurrenceState, WeekdayCode } from './recurrence'

const WEEKDAY_CODES: WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const WEEKDAY_LABELS: Record<WeekdayCode, string> = {
  MO: 'Mo',
  TU: 'Di',
  WE: 'Mi',
  TH: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SU: 'So',
}

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
]

function eventWeekday(eventDate: Date): WeekdayCode {
  return WEEKDAY_CODES[(getDay(eventDate) + 6) % 7]
}

export function RecurrenceFields({
  state,
  onChange,
  eventDate,
}: {
  state: RecurrenceState
  onChange: (s: RecurrenceState) => void
  eventDate: Date
}) {
  function handleFrequencyChange(frequency: Frequency) {
    if (frequency === 'weekly' && state.weekdays.length === 0) {
      onChange({ ...state, frequency, weekdays: [eventWeekday(eventDate)] })
      return
    }
    onChange({ ...state, frequency })
  }

  function toggleWeekday(day: WeekdayCode) {
    const weekdays = state.weekdays.includes(day)
      ? state.weekdays.filter((d) => d !== day)
      : [...state.weekdays, day]
    onChange({ ...state, weekdays })
  }

  return (
    <div className="flex flex-col gap-3 text-white">
      <label className="flex flex-col gap-1">
        Wiederholung
        <select
          aria-label="Wiederholung"
          className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
          value={state.frequency}
          onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
        >
          {FREQUENCY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {state.frequency !== 'none' && (
        <>
          <label className="flex flex-col gap-1">
            Intervall
            <input
              type="number"
              min={1}
              aria-label="Intervall"
              className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
              value={state.interval}
              onChange={(e) => onChange({ ...state, interval: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>

          {state.frequency === 'weekly' && (
            <div className="flex flex-col gap-1">
              <span>Wochentage</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_CODES.map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={WEEKDAY_LABELS[day]}
                    aria-pressed={state.weekdays.includes(day)}
                    onClick={() => toggleWeekday(day)}
                    className="rounded-full px-3 py-2 min-h-[44px] min-w-[44px] font-medium"
                    style={{
                      backgroundColor: state.weekdays.includes(day) ? '#3b82f6' : '#475569',
                    }}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend>Ende</legend>
            <label className="flex flex-wrap items-center gap-2 min-h-[44px]">
              <input
                type="radio"
                name="recurrence-end"
                aria-label="Nie"
                checked={state.end.type === 'never'}
                onChange={() => onChange({ ...state, end: { type: 'never' } })}
              />
              Nie
            </label>
            <label className="flex flex-wrap items-center gap-2 min-h-[44px]">
              <input
                type="radio"
                name="recurrence-end"
                aria-label="Am"
                checked={state.end.type === 'until'}
                onChange={() =>
                  onChange({ ...state, end: { type: 'until', date: format(eventDate, 'yyyy-MM-dd') } })
                }
              />
              Am
              <input
                type="date"
                aria-label="Enddatum"
                disabled={state.end.type !== 'until'}
                value={state.end.type === 'until' ? state.end.date : ''}
                onChange={(e) => onChange({ ...state, end: { type: 'until', date: e.target.value } })}
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 min-h-[44px]">
              <input
                type="radio"
                name="recurrence-end"
                aria-label="Nach"
                checked={state.end.type === 'count'}
                onChange={() => onChange({ ...state, end: { type: 'count', count: 10 } })}
              />
              Nach
              <input
                type="number"
                min={1}
                aria-label="Anzahl Termine"
                disabled={state.end.type !== 'count'}
                value={state.end.type === 'count' ? state.end.count : ''}
                onChange={(e) =>
                  onChange({ ...state, end: { type: 'count', count: Math.max(1, Number(e.target.value) || 1) } })
                }
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900 w-20"
              />
              Terminen
            </label>
          </fieldset>
        </>
      )}
    </div>
  )
}
