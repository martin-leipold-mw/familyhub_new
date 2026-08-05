import { useState } from 'react'
import { format } from 'date-fns'
import type { EventCreateRequest, MemberResponse } from '@/api/generated/model'
import { getEventSeries } from '@/api/generated/endpoints/familyHubAPI'
import { MemberSelect } from './MemberSelect'
import { formatTime } from './dates'
import { REMINDER_OPTIONS, presetToApi, apiToPreset, type ReminderPreset } from './reminders'
import { RecurrenceFields } from './RecurrenceFields'
import { buildRrule, parseRrule, EMPTY_RECURRENCE, type RecurrenceState } from './recurrence'
import {
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  type CalendarEvent,
} from './useCalendarEvents'

type EventScope = 'instance' | 'series'

function isoFromParts(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

export function EventDialog({
  members,
  initial,
  defaultDate,
  onClose,
}: {
  members: MemberResponse[]
  initial?: CalendarEvent | null
  defaultDate?: Date
  onClose: () => void
}) {
  const editing = !!initial
  const baseDate = initial?.start ?? defaultDate ?? new Date()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [memberId, setMemberId] = useState<string | null>(initial?.memberId ?? null)
  const [isAllDay, setIsAllDay] = useState(initial?.isAllDay ?? false)
  const [date, setDate] = useState(
    format(initial?.start ?? (initial?.allDayStart ? new Date(initial.allDayStart) : baseDate), 'yyyy-MM-dd'),
  )
  const [startTime, setStartTime] = useState(initial?.start ? formatTime(initial.start) : formatTime(baseDate))
  const [endTime, setEndTime] = useState(
    initial?.end ? formatTime(initial.end) : formatTime(new Date(baseDate.getTime() + 60 * 60 * 1000)),
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [reminder, setReminder] = useState<ReminderPreset>(
    initial ? apiToPreset(initial.reminderUseDefault, initial.reminderMinutes) : 'default',
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceState>(EMPTY_RECURRENCE)
  const isRecurringInstance = !!initial?.recurringEventId
  const [scope, setScope] = useState<EventScope>('instance')
  const [seriesLoading, setSeriesLoading] = useState(false)

  const create = useCreateEventMutation()
  const update = useUpdateEventMutation()
  const remove = useDeleteEventMutation()

  async function handleScopeChange(next: EventScope) {
    setScope(next)
    if (next === 'series' && initial) {
      setError(null)
      setSeriesLoading(true)
      try {
        const res = await getEventSeries(initial.id)
        setRecurrence(parseRrule(res.data.recurrenceRule ?? null))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Serie konnte nicht geladen werden.')
      } finally {
        setSeriesLoading(false)
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (title.trim().length === 0) {
      setError('Bitte gib einen Titel ein.')
      return
    }
    if (!memberId) {
      setError('Bitte wähle ein Mitglied.')
      return
    }
    if (!isAllDay && endTime <= startTime) {
      setError('Die Endzeit muss nach der Startzeit liegen.')
      return
    }

    const reminderFields = presetToApi(reminder)
    const includeRecurrence = !editing || (isRecurringInstance && scope === 'series')
    const recurrenceField = includeRecurrence
      ? { recurrenceRule: buildRrule(recurrence, { isAllDay }) ?? null }
      : {}
    const data: EventCreateRequest = isAllDay
      ? { memberId, title: title.trim(), isAllDay: true, allDayStart: date, allDayEnd: initial?.allDayEnd && initial.allDayEnd > date ? initial.allDayEnd : null, location: location || null, description: description || null, ...reminderFields, ...recurrenceField }
      : { memberId, title: title.trim(), isAllDay: false, start: isoFromParts(date, startTime), end: isoFromParts(date, endTime), location: location || null, description: description || null, ...reminderFields, ...recurrenceField }

    try {
      if (editing && initial) {
        const params = isRecurringInstance ? { scope } : undefined
        await update.mutateAsync({ id: initial.id, data, params })
      } else {
        await create.mutateAsync({ data })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  async function doDelete() {
    try {
      const params = isRecurringInstance ? { scope } : undefined
      await remove.mutateAsync({ id: initial!.id, params })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

  const isPending = create.isPending || update.isPending || remove.isPending

  return (
    <div
      role="dialog"
      aria-label={editing ? 'Termin bearbeiten' : 'Termin anlegen'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <form onSubmit={submit} className="my-8 w-full max-w-lg rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary">{editing ? 'Termin bearbeiten' : 'Termin anlegen'}</h2>

        <label className="flex flex-col gap-1 text-primary">
          Titel
          <input
            aria-label="Titel"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <MemberSelect members={members} value={memberId} onChange={setMemberId} />

        <label className="flex items-center gap-2 text-primary min-h-[44px]">
          <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
          Ganztägig
        </label>

        <label className="flex flex-col gap-1 text-primary">
          Datum
          <input
            type="date"
            aria-label="Datum"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        {!isAllDay && (
          <div className="flex gap-4">
            <label className="flex flex-1 flex-col gap-1 text-primary">
              Von
              <input
                type="time"
                aria-label="Von"
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-primary">
              Bis
              <input
                type="time"
                aria-label="Bis"
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1 text-primary">
          Ort (optional)
          <input
            aria-label="Ort (optional)"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-primary">
          Beschreibung (optional)
          <textarea
            aria-label="Beschreibung (optional)"
            className="rounded-lg px-3 py-2 text-slate-900"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-primary">
          Erinnerung
          <select
            aria-label="Erinnerung"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={reminder}
            onChange={(e) => setReminder(e.target.value as ReminderPreset)}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {!editing && (
          <RecurrenceFields
            state={recurrence}
            onChange={setRecurrence}
            eventDate={new Date(`${date}T${startTime}:00`)}
          />
        )}

        {editing && isRecurringInstance && (
          <fieldset className="flex flex-col gap-2 text-primary">
            <legend>Serie</legend>
            <label className="flex items-center gap-2 min-h-[44px]">
              <input
                type="radio"
                name="event-scope"
                checked={scope === 'instance'}
                onChange={() => handleScopeChange('instance')}
              />
              Nur diesen Termin
            </label>
            <label className="flex items-center gap-2 min-h-[44px]">
              <input
                type="radio"
                name="event-scope"
                checked={scope === 'series'}
                onChange={() => handleScopeChange('series')}
              />
              Ganze Serie
            </label>
            {scope === 'series' && seriesLoading && <p>Serie wird geladen…</p>}
            {scope === 'series' && !seriesLoading && (
              <RecurrenceFields
                state={recurrence}
                onChange={setRecurrence}
                eventDate={new Date(`${date}T${startTime}:00`)}
              />
            )}
          </fieldset>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <div className="flex flex-wrap gap-3 justify-end">
          {editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mr-auto rounded-xl bg-danger px-4 py-3 min-h-[44px] text-white"
            >
              Löschen
            </button>
          )}
          {editing && confirmDelete && (
            <button
              type="button"
              onClick={doDelete}
              className="mr-auto rounded-xl bg-danger px-4 py-3 min-h-[44px] text-white"
            >
              Wirklich löschen
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-surface-2 px-4 py-3 min-h-[44px] text-primary"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-accent px-4 py-3 min-h-[44px] text-white disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
