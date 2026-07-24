import { useState, useEffect } from 'react'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useCalendarsForMember, useSaveSelectedCalendarsMutation } from '@/features/google/useCalendars'

export function CalendarSelectStep({ onNext }: { onNext: () => void }) {
  const { connections, isLoading: connectionsLoading } = useGoogleConnections()
  const memberId = connections[0]?.memberId ?? ''

  const { calendars, isLoading: calendarsLoading } = useCalendarsForMember(memberId)
  const saveMutation = useSaveSelectedCalendarsMutation()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialized && calendars.length > 0) {
      setSelected(new Set(calendars.filter((c) => c.isPrimary || c.isSelected).map((c) => c.id)))
      setInitialized(true)
    }
  }, [calendars, initialized])

  function toggleCalendar(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError(null)
  }

  async function handleSave() {
    setError(null)
    try {
      await saveMutation.mutateAsync({ data: { memberId, calendarIds: Array.from(selected) } })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kalender konnten nicht gespeichert werden.')
    }
  }

  if (connectionsLoading || calendarsLoading) {
    return <p className="text-slate-300 text-center">Lade...</p>
  }

  if (connections.length === 0) {
    return <p className="text-slate-300 text-center">Keine Verbindung gefunden.</p>
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <h1 className="text-2xl font-bold text-center">Kalender auswählen</h1>
      <p className="text-slate-300">Wähle die Kalender aus, die du synchronisieren möchtest.</p>

      <ul className="flex flex-col gap-3">
        {calendars.map((cal) => (
          <li key={cal.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`cal-${cal.id}`}
              checked={selected.has(cal.id)}
              onChange={() => toggleCalendar(cal.id)}
              className="w-5 h-5 accent-blue-500 cursor-pointer"
            />
            {cal.backgroundColor && (
              <span
                className="w-4 h-4 rounded-sm flex-shrink-0"
                style={{ backgroundColor: cal.backgroundColor }}
                aria-hidden="true"
              />
            )}
            <label htmlFor={`cal-${cal.id}`} className="cursor-pointer">
              {cal.summary}
            </label>
          </li>
        ))}
      </ul>

      {selected.size === 0 && (
        <p className="text-red-400 text-sm text-center">Wähle mindestens einen Kalender aus.</p>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="button"
        disabled={selected.size === 0}
        onClick={handleSave}
        className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
      >
        Speichern &amp; weiter
      </button>
    </div>
  )
}
