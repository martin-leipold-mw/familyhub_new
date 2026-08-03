import { useState, useEffect } from 'react'
import type { ConnectionResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useCalendarsForMember, useSaveSelectedCalendarsMutation } from '@/features/google/useCalendars'

function ConnectionCalendarSelect({
  connection,
  onSelectionChange,
}: {
  connection: ConnectionResponse
  onSelectionChange: (memberId: string, calendarIds: string[]) => void
}) {
  const { calendars } = useCalendarsForMember(connection.memberId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && calendars.length > 0) {
      const next = new Set(calendars.filter((c) => c.isPrimary || c.isSelected).map((c) => c.id))
      setSelected(next)
      setInitialized(true)
      onSelectionChange(connection.memberId, Array.from(next))
    }
  }, [calendars, initialized, connection.memberId, onSelectionChange])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange(connection.memberId, Array.from(next))
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{connection.name}</h2>
      <ul className="flex flex-col gap-3">
        {calendars.map((cal) => (
          <li key={cal.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`cal-${cal.id}`}
              checked={selected.has(cal.id)}
              onChange={() => toggle(cal.id)}
              className="w-5 h-5 accent-blue-500 cursor-pointer"
            />
            <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: cal.color }} aria-hidden="true" />
            <label htmlFor={`cal-${cal.id}`} className="cursor-pointer">
              {cal.summary}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CalendarSelectStep({ onNext }: { onNext: () => void }) {
  const { connections, isLoading: connectionsLoading } = useGoogleConnections()
  const saveMutation = useSaveSelectedCalendarsMutation()
  const [byMember, setByMember] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)

  function handleSelectionChange(memberId: string, calendarIds: string[]) {
    setByMember((prev) => ({ ...prev, [memberId]: calendarIds }))
    setError(null)
  }

  const totalSelected = Object.values(byMember).reduce((n, ids) => n + ids.length, 0)

  async function handleSave() {
    setError(null)
    try {
      for (const [memberId, calendarIds] of Object.entries(byMember)) {
        await saveMutation.mutateAsync({ data: { memberId, calendarIds } })
      }
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kalender konnten nicht gespeichert werden.')
    }
  }

  if (connectionsLoading) {
    return <p className="text-slate-300 text-center">Lade...</p>
  }

  if (connections.length === 0) {
    return <p className="text-slate-300 text-center">Keine Verbindung gefunden.</p>
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <h1 className="text-2xl font-bold text-center">Kalender auswählen</h1>
      <p className="text-slate-300">Wähle die Kalender aus, die du synchronisieren möchtest.</p>

      {connections.map((connection) => (
        <ConnectionCalendarSelect
          key={connection.connectionId}
          connection={connection}
          onSelectionChange={handleSelectionChange}
        />
      ))}

      {totalSelected === 0 && (
        <p className="text-red-400 text-sm text-center">Wähle mindestens einen Kalender aus.</p>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="button"
        disabled={totalSelected === 0}
        onClick={handleSave}
        className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
      >
        Speichern &amp; weiter
      </button>
    </div>
  )
}
