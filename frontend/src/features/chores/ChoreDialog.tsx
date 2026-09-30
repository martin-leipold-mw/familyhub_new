import { useState } from 'react'
import type { ChoreResponse } from '@/api/generated/model'
import { ApiError } from '@/api/customFetch'
import { CHORE_ICONS, DEFAULT_CHORE_ICON } from './choreIcons'
import { INTERVAL_OPTIONS, GROUP_OPTIONS, type ChoreGroup } from './choreLabels'
import { useCreateChoreMutation, useUpdateChoreMutation, useDeleteChoreMutation } from './useChores'

const POINTS_MIN = 5
const POINTS_MAX = 50
const POINTS_STEP = 5

type ChoreDialogProps = {
  chore: ChoreResponse | null
  onClose: () => void
}

/**
 * Anlegen und Bearbeiten in einem Dialog. Bestätigungen laufen über eigene
 * Schaltflächen, nie über `confirm()` — auf einem Wanddisplay ohne Tastatur
 * sind Browserdialoge unbedienbar.
 */
export function ChoreDialog({ chore, onClose }: ChoreDialogProps) {
  const editing = chore !== null

  const [name, setName] = useState(chore?.name ?? '')
  const [icon, setIcon] = useState(chore?.icon ?? DEFAULT_CHORE_ICON)
  const [description, setDescription] = useState(chore?.description ?? '')
  const [intervalDays, setIntervalDays] = useState(chore?.intervalDays ?? 7)
  const [group, setGroup] = useState<ChoreGroup>((chore?.assignmentGroup ?? 'all') as ChoreGroup)
  const [points, setPoints] = useState(chore?.points ?? 10)
  const [isActive, setIsActive] = useState(chore?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const createMutation = useCreateChoreMutation()
  const updateMutation = useUpdateChoreMutation()
  const deleteMutation = useDeleteChoreMutation()
  const isSaving = createMutation.isPending || updateMutation.isPending

  async function handleSubmit() {
    setError(null)
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Bitte einen Namen eingeben.')
      return
    }
    const trimmedDescription = description.trim()
    const normalizedDescription = trimmedDescription === '' ? null : trimmedDescription

    try {
      if (chore === null) {
        await createMutation.mutateAsync({
          data: {
            name: trimmedName,
            icon,
            description: normalizedDescription,
            intervalDays,
            assignmentGroup: group,
            points,
          },
        })
      } else {
        // clearFields ist der einzige Weg, die Beschreibung per PATCH wirklich
        // zu leeren; ein weggelassener Wert bedeutet dort "unverändert".
        const clears = chore.description && normalizedDescription === null ? ['description' as const] : undefined
        await updateMutation.mutateAsync({
          id: chore.id,
          data: {
            name: trimmedName,
            icon,
            description: normalizedDescription ?? undefined,
            intervalDays,
            assignmentGroup: group,
            points,
            isActive,
            clearFields: clears,
          },
        })
      }
      onClose()
    } catch {
      setError('Speichern fehlgeschlagen.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteMutation.mutateAsync({ id: chore!.id })
      onClose()
    } catch (deleteError) {
      setError(
        deleteError instanceof ApiError && deleteError.status === 409
          ? 'Löschen nicht möglich — die Aufgabe wurde bereits erledigt. Bitte pausieren.'
          : 'Löschen fehlgeschlagen. Bitte erneut versuchen.',
      )
      setConfirmDelete(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="my-8 flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-surface p-6">
        <h2 className="text-xl font-bold text-primary">{editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>

        <label className="flex flex-col gap-1 text-primary">
          Name
          <input
            aria-label="Name"
            placeholder="z. B. Toilette putzen"
            className="min-h-[44px] rounded-lg px-3 py-3 text-slate-900"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Symbol</legend>
          <div className="flex flex-wrap gap-2">
            {CHORE_ICONS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-label={`Symbol ${candidate}`}
                aria-pressed={icon === candidate}
                onClick={() => setIcon(candidate)}
                className={`min-h-[56px] min-w-[56px] rounded-xl text-3xl ${
                  icon === candidate ? 'bg-accent' : 'bg-surface-2'
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-primary">
          Beschreibung
          <input
            aria-label="Beschreibung"
            placeholder="z. B. Auch den Spiegel!"
            className="min-h-[44px] rounded-lg px-3 py-3 text-slate-900"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Wie oft?</legend>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                aria-pressed={intervalDays === option.days}
                onClick={() => setIntervalDays(option.days)}
                className={`min-h-[44px] rounded-full px-4 ${
                  intervalDays === option.days ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-primary">Wer?</legend>
          <div className="flex flex-wrap gap-2">
            {GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={group === option.value}
                onClick={() => setGroup(option.value)}
                className={`min-h-[44px] rounded-full px-4 ${
                  group === option.value ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-primary">
          {`Punkte: ${points}`}
          <input
            type="range"
            aria-label="Punkte"
            min={POINTS_MIN}
            max={POINTS_MAX}
            step={POINTS_STEP}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </label>

        {editing && (
          <button
            type="button"
            aria-label="Aktiv"
            aria-pressed={isActive}
            onClick={() => setIsActive((active) => !active)}
            className={`min-h-[44px] self-start rounded-full px-4 ${
              isActive ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
            }`}
          >
            Aktiv
          </button>
        )}

        {error && <p className="text-danger">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
            className="min-h-[44px] rounded-xl bg-accent px-4 text-white disabled:opacity-50"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
          >
            Abbrechen
          </button>

          {editing && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto min-h-[44px] rounded-xl bg-danger-weak px-4 text-danger"
            >
              Löschen
            </button>
          )}
        </div>

        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-weak p-3">
            <span className="text-danger">Wirklich löschen?</span>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="min-h-[44px] rounded-xl bg-danger px-4 text-white"
            >
              Ja, löschen
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
            >
              Nein, behalten
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
