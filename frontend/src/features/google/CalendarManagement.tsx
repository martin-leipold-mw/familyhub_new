import { useState, useEffect } from 'react'
import type { ConnectionResponse, CalendarResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useCalendarsForMember, useSaveSelectedCalendarsMutation } from '@/features/google/useCalendars'
import { usePinSession } from '@/features/pin/PinSessionContext'

interface ConnectionCalendarsProps {
  connection: ConnectionResponse
  hasPinSession: boolean
}

function ConnectionCalendars({ connection, hasPinSession }: ConnectionCalendarsProps) {
  const { calendars, isLoading, isError } = useCalendarsForMember(connection.memberId)
  const saveMutation = useSaveSelectedCalendarsMutation()

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    calendars.filter((c) => c.isSelected).map((c) => c.id)
  )

  useEffect(() => {
    setSelectedIds(calendars.filter((c) => c.isSelected).map((c) => c.id))
  }, [calendars])

  function handleToggle(calendarId: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? [...prev, calendarId] : prev.filter((id) => id !== calendarId)
    )
  }

  async function handleSave() {
    await saveMutation.mutateAsync({
      data: {
        memberId: connection.memberId,
        calendarIds: selectedIds,
      },
    })
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-medium text-white mb-2">
        {connection.name} – Kalender
      </h3>

      {isLoading && <p className="text-slate-400">Wird geladen…</p>}
      {isError && <p className="text-red-400">Fehler beim Laden der Kalender.</p>}
      {!isLoading && !isError && calendars.length === 0 && (
        <p className="text-slate-400">Keine Kalender gefunden.</p>
      )}

      {!isLoading && !isError && calendars.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {calendars.map((calendar: CalendarResponse) => (
            <li key={calendar.id} className="flex items-center gap-2">
              <span
                className={`w-4 h-4 rounded-sm flex-shrink-0 ${!calendar.backgroundColor ? 'bg-slate-500' : ''}`}
                style={calendar.backgroundColor ? { backgroundColor: calendar.backgroundColor } : undefined}
                aria-hidden="true"
              />
              <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(calendar.id)}
                  onChange={(e) => handleToggle(calendar.id, e.target.checked)}
                  disabled={!hasPinSession}
                  className="w-5 h-5"
                />
                {calendar.summary}
              </label>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && (
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasPinSession}
          aria-disabled={!hasPinSession}
          className="rounded-xl bg-blue-500 px-4 py-2 min-h-[44px] text-white disabled:opacity-50"
        >
          Speichern
        </button>
      )}
    </div>
  )
}

export function CalendarManagement() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { hasPinSession } = usePinSession()

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold text-white mb-4">Kalender verwalten</h2>
        <p className="text-slate-400">Wird geladen…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold text-white mb-4">Kalender verwalten</h2>
        <p className="text-red-400">Fehler beim Laden der Verbindungen.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h2 className="text-xl font-semibold text-white mb-4">Kalender verwalten</h2>

      {connections.length === 0 ? (
        <p className="text-slate-400">Keine Google-Konten verbunden.</p>
      ) : (
        <>
          {!hasPinSession && (
            <p className="text-slate-400 text-sm mb-4">
              Melde dich mit PIN an, um Kalender zu verwalten.
            </p>
          )}
          {connections.map((connection) => (
            <ConnectionCalendars
              key={connection.connectionId}
              connection={connection}
              hasPinSession={hasPinSession}
            />
          ))}
        </>
      )}
    </div>
  )
}
