import { Check, Undo2 } from 'lucide-react'
import type { ChoreAssignmentResponse } from '@/api/generated/model'

type ChoreCardProps = {
  assignment: ChoreAssignmentResponse
  color: string
  undoable: boolean
  onComplete: (id: string) => void
  onUndo: (id: string) => void
}

/**
 * Abgehakt wird über einen eigenen großen Knopf, nicht über die ganze Karte:
 * beim Wischen durch eine Liste wäre eine flächig tippbare Karte zu leicht
 * versehentlich ausgelöst. Das Emoji trägt die Information — Name und
 * Beschreibung stehen daneben, sind aber nicht nötig, um die Aufgabe zu
 * erkennen.
 */
export function ChoreCard({ assignment, color, undoable, onComplete, onUndo }: ChoreCardProps) {
  const done = assignment.status === 'completed'
  return (
    <li className={`flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ${done ? 'opacity-60' : ''}`}>
      <span aria-hidden className="text-[56px] leading-none">{assignment.icon}</span>

      <span className="flex-1 min-w-0">
        <span className={`block text-xl font-semibold ${done ? 'line-through text-muted' : 'text-primary'}`}>
          {assignment.name}
        </span>
        {assignment.description && (
          <span data-testid="chore-description" className="block text-sm text-muted">
            {assignment.description}
          </span>
        )}
      </span>

      {done ? (
        undoable && (
          <button
            type="button"
            aria-label="Rückgängig"
            onClick={() => onUndo(assignment.id)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-muted"
          >
            <Undo2 aria-hidden />
          </button>
        )
      ) : (
        <button
          type="button"
          aria-label={`${assignment.name} erledigt`}
          onClick={() => onComplete(assignment.id)}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 bg-surface"
          style={{ borderColor: color }}
        >
          <Check aria-hidden className="h-8 w-8" style={{ color }} />
        </button>
      )}
    </li>
  )
}
