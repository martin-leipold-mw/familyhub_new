import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ConnectionResponse, CalendarResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllCalendars,
  useCalendarsForMember,
  useSaveSelectedCalendarsMutation,
  useUpdateCalendarFlagsMutation,
} from '@/features/google/useCalendars'

function ConnectionCalendars({ connection }: { connection: ConnectionResponse }) {
  const { calendars, isLoading, isError } = useCalendarsForMember(connection.memberId)
  const saveMutation = useSaveSelectedCalendarsMutation()
  const flagsMutation = useUpdateCalendarFlagsMutation()

  async function setShared(calendarId: string, isShared: boolean) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isShared } })
  }

  async function setWriteTarget(calendarId: string) {
    await flagsMutation.mutateAsync({ data: { memberId: connection.memberId, calendarId, isWriteTarget: true } })
  }

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    calendars.filter((c) => c.isSelected).map((c) => c.id),
  )

  useEffect(() => {
    setSelectedIds(calendars.filter((c) => c.isSelected).map((c) => c.id))
  }, [calendars])

  function handleToggle(calendarId: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, calendarId] : prev.filter((id) => id !== calendarId)))
  }

  async function handleSave() {
    await saveMutation.mutateAsync({ data: { memberId: connection.memberId, calendarIds: selectedIds } })
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-medium text-primary mb-2">{connection.name} – Kalender</h3>

      {isLoading && <p className="text-muted">Wird geladen…</p>}
      {isError && <p className="text-danger">Fehler beim Laden der Kalender.</p>}
      {!isLoading && !isError && calendars.length === 0 && (
        <p className="text-muted">Keine Kalender gefunden.</p>
      )}

      {!isLoading && !isError && calendars.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {calendars.map((calendar: CalendarResponse) => (
            <li key={calendar.id} className="flex flex-wrap items-center gap-3">
              <span
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: calendar.color }}
                aria-hidden="true"
              />
              <label className="flex items-center gap-2 text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(calendar.id)}
                  onChange={(e) => handleToggle(calendar.id, e.target.checked)}
                  className="w-5 h-5"
                />
                {calendar.summary}
              </label>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Geteilt/Familie"
                  checked={calendar.isShared}
                  onChange={(e) => void setShared(calendar.id, e.target.checked)}
                  className="w-5 h-5"
                />
                Geteilt
              </label>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="radio"
                  aria-label="Primärkalender"
                  name={`write-target-${connection.connectionId}`}
                  checked={calendar.isWriteTarget}
                  onChange={() => void setWriteTarget(calendar.id)}
                  className="w-5 h-5"
                />
                Primär
              </label>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && (
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-accent px-4 py-2 min-h-[44px] text-white"
        >
          Speichern
        </button>
      )}
    </div>
  )
}

export function CalendarSection() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { calendars } = useAllCalendars()
  const [open, setOpen] = useState(false)
  const selectedCount = calendars.filter((c) => c.isSelected).length

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-muted">Wird geladen…</p>
      </section>
    )
  }

  if (isError) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-danger">Fehler beim Laden der Verbindungen.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-surface border border-subtle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 min-h-[44px]"
      >
        <span className="text-xl font-semibold text-primary">Kalender · {selectedCount} ausgewählt</span>
        {open ? <ChevronDown aria-hidden className="text-muted" /> : <ChevronRight aria-hidden className="text-muted" />}
      </button>
      {open && (
        <div className="p-4 pt-0">
          {connections.length === 0 ? (
            <p className="text-muted">Keine Google-Konten verbunden.</p>
          ) : (
            connections.map((connection) => (
              <ConnectionCalendars key={connection.connectionId} connection={connection} />
            ))
          )}
        </div>
      )}
    </section>
  )
}
