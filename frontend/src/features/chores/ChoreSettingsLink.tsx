import { Link } from 'react-router-dom'
import { useChores } from './useChores'

/**
 * Die Zeile in `SettingsView`, die auf die Unterseite führt. Damit entsteht das
 * Muster „Einstellungen mit Unterseiten", das die Schritte 7–9 (Belohnungen,
 * Synology-Fotos, Kiosk/Wetter) ohnehin brauchen werden.
 */
export function ChoreSettingsLink() {
  const { chores } = useChores()
  const label = chores.length === 1 ? '1 Aufgabe' : `${chores.length} Aufgaben`

  return (
    <Link
      to="/settings/chores"
      className="flex min-h-[44px] items-center justify-between rounded-2xl border border-subtle bg-surface p-4 text-primary"
    >
      <span className="text-xl font-semibold">{`Haushalt · ${label}`}</span>
      <span aria-hidden className="text-accent">→</span>
    </Link>
  )
}
