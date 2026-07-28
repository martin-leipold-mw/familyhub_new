import { useState } from 'react'
import { format } from 'date-fns'
import type { EventCreateRequest, MemberResponse } from '@/api/generated/model'
import { MemberSelect } from './MemberSelect'
import { formatTime } from './dates'
import {
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  type CalendarEvent,
} from './useCalendarEvents'

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
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const create = useCreateEventMutation()
  const update = useUpdateEventMutation()
  const remove = useDeleteEventMutation()

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

    const data: EventCreateRequest = isAllDay
      ? { memberId, title: title.trim(), isAllDay: true, allDayStart: date, allDayEnd: null, location: location || null, description: description || null }
      : { memberId, title: title.trim(), isAllDay: false, start: isoFromParts(date, startTime), end: isoFromParts(date, endTime), location: location || null, description: description || null }

    try {
      if (editing && initial) {
        await update.mutateAsync({ id: initial.id, data })
      } else {
        await create.mutateAsync({ data })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  async function doDelete() {
    if (!initial) return
    try {
      await remove.mutateAsync({ id: initial.id })
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-slate-800 p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white">{editing ? 'Termin bearbeiten' : 'Termin anlegen'}</h2>

        <label className="flex flex-col gap-1 text-white">
          Titel
          <input
            aria-label="Titel"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <MemberSelect members={members} value={memberId} onChange={setMemberId} />

        <label className="flex items-center gap-2 text-white min-h-[44px]">
          <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
          Ganztägig
        </label>

        <label className="flex flex-col gap-1 text-white">
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
            <label className="flex flex-1 flex-col gap-1 text-white">
              Von
              <input
                type="time"
                aria-label="Von"
                className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-white">
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

        <label className="flex flex-col gap-1 text-white">
          Ort (optional)
          <input
            aria-label="Ort (optional)"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-white">
          Beschreibung (optional)
          <textarea
            aria-label="Beschreibung (optional)"
            className="rounded-lg px-3 py-2 text-slate-900"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex flex-wrap gap-3 justify-end">
          {editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mr-auto rounded-xl bg-red-700 px-4 py-3 min-h-[44px] text-white"
            >
              Löschen
            </button>
          )}
          {editing && confirmDelete && (
            <button
              type="button"
              onClick={doDelete}
              className="mr-auto rounded-xl bg-red-600 px-4 py-3 min-h-[44px] text-white"
            >
              Wirklich löschen
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-600 px-4 py-3 min-h-[44px] text-white"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-blue-500 px-4 py-3 min-h-[44px] text-white disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
