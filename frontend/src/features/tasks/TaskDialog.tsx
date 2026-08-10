import { useState } from 'react'
import type { TaskResponse } from '@/api/generated/model'
import { useCreateTaskMutation, useUpdateTaskMutation, useDeleteTaskMutation } from './useTasks'

type Priority = 'low' | 'medium' | 'high'
type ClearField = 'notes' | 'dueDate' | 'priority'

// "Keine" is a real, selectable fourth option (not a repress-to-deselect gesture) — it clears
// the priority. value: null is what "no priority" means throughout this component.
const PRIORITY_OPTIONS: { value: Priority | null; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: null, label: 'Keine' },
]

type TaskDialogProps = {
  task: TaskResponse | null
  memberId: string
  onClose: () => void
}

export function TaskDialog({ task, memberId, onClose }: TaskDialogProps) {
  const editing = task !== null

  const [title, setTitle] = useState(task?.title ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  // "Mittel" ist nur die Voreinstellung beim Anlegen — beim Bearbeiten wird immer der
  // tatsächliche Wert der Aufgabe übernommen (auch wenn der null ist), sonst würde ein reiner
  // Titel-Edit einer prioritätslosen Aufgabe stillschweigend "Mittel" zuweisen.
  const [priority, setPriority] = useState<Priority | null>(task === null ? 'medium' : task.priority ?? null)
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [failed, setFailed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const createMutation = useCreateTaskMutation()
  const updateMutation = useUpdateTaskMutation()
  const deleteMutation = useDeleteTaskMutation()
  const isSaving = createMutation.isPending || updateMutation.isPending

  function handleCancel() {
    // Verhindert, dass ein scharf gestellter Löschen-Bestätigungszustand überlebt, falls diese
    // Dialog-Instanz (statt neu gemountet zu werden) für eine andere Aufgabe wiederverwendet wird.
    setConfirmDelete(false)
    onClose()
  }

  async function handleSubmit() {
    setFailed(false)
    const trimmedTitle = title.trim()
    const trimmedNotes = notes.trim()
    // Leere Eingabe heißt "kein Wert", nicht "Wert ''".
    const normalizedNotes = trimmedNotes === '' ? null : trimmedNotes
    const normalizedDueDate = dueDate === '' ? null : dueDate

    try {
      if (task === null) {
        await createMutation.mutateAsync({
          data: {
            memberId,
            title: trimmedTitle,
            notes: normalizedNotes,
            dueDate: normalizedDueDate,
            priority,
          },
        })
      } else {
        // clearFields ist der einzige Weg, ein Google-gepflegtes Feld per PATCH wirklich zu
        // löschen — ein weggelassener/undefined-Wert bedeutet sonst immer "unverändert" (siehe
        // TaskMapper.toGoogleTask im Backend). Ein Feld landet nur dann in clearFields, wenn die
        // Aufgabe vorher tatsächlich einen Wert hatte und dieser jetzt geleert wurde; war das
        // Feld nie gesetzt, gibt es dort nichts zu löschen. Google wird beim Bearbeiten trotzdem
        // immer kontaktiert, weil title (ein Pflichtfeld) hier immer mitgeschickt wird.
        const clearFields: ClearField[] = []
        if (task.notes && normalizedNotes === null) clearFields.push('notes')
        if (task.dueDate && normalizedDueDate === null) clearFields.push('dueDate')
        if (task.priority && priority === null) clearFields.push('priority')

        await updateMutation.mutateAsync({
          id: task.id,
          data: {
            title: trimmedTitle,
            notes: normalizedNotes ?? undefined,
            dueDate: normalizedDueDate ?? undefined,
            priority: priority ?? undefined,
            clearFields: clearFields.length > 0 ? clearFields : undefined,
          },
        })
      }
      onClose()
    } catch {
      setFailed(true)
    }
  }

  async function handleDelete() {
    setFailed(false)
    try {
      await deleteMutation.mutateAsync({ id: task!.id })
      onClose()
    } catch {
      setFailed(true)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary">{editing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>

        <label className="flex flex-col gap-1 text-primary">
          Aufgabe
          <input
            aria-label="Aufgabe"
            placeholder="z. B. Einkaufen gehen"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-primary">
          Fällig am
          <input
            type="date"
            aria-label="Fällig am"
            className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>

        <fieldset className="flex flex-col gap-2 text-primary">
          <legend>Priorität</legend>
          <div className="flex gap-3">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={priority === p.value}
                onClick={() => setPriority(p.value)}
                className={`flex-1 rounded-xl px-3 py-3 min-h-[44px] font-medium ${
                  priority === p.value ? 'bg-accent text-white' : 'bg-surface-2 text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-primary">
          Notizen (optional)
          <textarea
            aria-label="Notizen (optional)"
            placeholder="Zusätzliche Details…"
            className="rounded-lg px-3 py-2 text-slate-900"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {failed && <p className="text-danger text-sm">Speichern fehlgeschlagen.</p>}

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
              onClick={handleDelete}
              className="mr-auto rounded-xl bg-danger px-4 py-3 min-h-[44px] text-white"
            >
              Wirklich löschen
            </button>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl bg-surface-2 px-4 py-3 min-h-[44px] text-primary"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={title.trim() === '' || isSaving}
            className="rounded-xl bg-accent px-4 py-3 min-h-[44px] text-white disabled:opacity-50"
          >
            {isSaving ? 'Speichern…' : editing ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
