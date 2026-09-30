import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { ChoreResponse } from '@/api/generated/model'
import { PinGate } from '@/features/pin/PinGate'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoreDialog } from './ChoreDialog'
import { ChoreSettingsRow } from './ChoreSettingsRow'
import { choreStatus } from './choreStatus'
import { useChores, useUpdateChoreMutation } from './useChores'

type DialogState = { chore: ChoreResponse | null }

/**
 * Eigene Unterseite statt Abschnitt in `SettingsView`: Die Ämtli-Verwaltung ist
 * echtes CRUD mit reichem Dialog und realistisch 10–20 Einträgen, bedient auf
 * einem 24-Zoll-Touchdisplay ohne Tastatur. Eine eigene Seite gibt ihr volle
 * Breite und große Touch-Ziele.
 */
export function ChoreSettingsView() {
  const { chores, isLoading, isError } = useChores()
  const { members } = useMembers()
  const updateMutation = useUpdateChoreMutation()
  const [dialog, setDialog] = useState<DialogState | null>(null)

  // Der Browser des Wanddisplays läuft in der Haushaltszeitzone; 'sv-SE'
  // liefert das ISO-Format YYYY-MM-DD, das choreStatus erwartet.
  const today = new Date().toLocaleDateString('sv-SE')

  function handleToggleActive(chore: ChoreResponse, next: boolean) {
    updateMutation.mutate({ id: chore.id, data: { isActive: next } })
  }

  return (
    <PinGate>
      <div className="min-h-screen bg-bg p-6 text-primary">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <Link to="/settings" className="flex min-h-[44px] items-center text-accent">
            ← Zu den Einstellungen
          </Link>

          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-primary">Haushaltsaufgaben</h1>
            <button
              type="button"
              aria-label="Neue Aufgabe"
              onClick={() => setDialog({ chore: null })}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-accent-weak text-accent"
            >
              <Plus aria-hidden />
            </button>
          </div>

          {isError && <p className="text-danger">Fehler beim Laden der Haushaltsaufgaben.</p>}

          {isLoading && <p className="text-muted">Wird geladen…</p>}

          {!isLoading && !isError && chores.length === 0 && (
            <p className="text-muted">Noch keine Haushaltsaufgaben angelegt.</p>
          )}

          {!isLoading && !isError && chores.length > 0 && (
            <ul className="flex flex-col gap-3">
              {chores.map((chore) => (
                <ChoreSettingsRow
                  key={chore.id}
                  chore={chore}
                  status={choreStatus(chore, members, today)}
                  onEdit={(selected) => setDialog({ chore: selected })}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {dialog && <ChoreDialog chore={dialog.chore} onClose={() => setDialog(null)} />}
    </PinGate>
  )
}
