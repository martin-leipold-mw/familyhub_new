import { Pencil, Calendar } from 'lucide-react'
import type { TaskResponse } from '@/api/generated/model'
import { formatDueDate } from './dueDate'

const STAR_COUNT: Record<string, number> = { high: 3, medium: 2, low: 1 }
const TONE_CLASS = {
  urgent: 'text-warn font-semibold',
  overdue: 'text-danger font-semibold',
  normal: 'text-muted',
}

type TaskRowProps = {
  task: TaskResponse
  color: string
  today: Date
  onToggle: (task: TaskResponse) => void
  onEdit: (task: TaskResponse) => void
}

export function TaskRow({ task, color, today, onToggle, onEdit }: TaskRowProps) {
  const due = formatDueDate(task.dueDate, today)
  const stars = STAR_COUNT[task.priority ?? ''] ?? 0
  const done = task.status === 'completed'
  return (
    <li className="flex items-start gap-3 py-1">
      <button
        type="button"
        aria-label={task.title}
        aria-pressed={done}
        onClick={() => onToggle(task)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <span
          className="w-7 h-7 rounded-full border-4 flex items-center justify-center"
          style={{ borderColor: color, backgroundColor: done ? color : 'transparent' }}
        />
      </button>

      <span className="flex-1 pt-2">
        <span className={done ? 'line-through text-muted' : 'text-primary'}>{task.title}</span>
        {task.notes && (
          <span data-testid="task-notes" className="block text-sm text-muted">
            {task.notes}
          </span>
        )}
        {(due || stars > 0) && (
          <span className="flex items-center gap-3 text-sm">
            {due && (
              <span data-testid="due-label" className={TONE_CLASS[due.tone]}>
                <Calendar aria-hidden className="inline w-4 h-4 mr-1" />
                {due.text}
              </span>
            )}
            {stars > 0 && <span aria-label={`Priorität ${task.priority}`}>{'⭐'.repeat(stars)}</span>}
          </span>
        )}
      </span>

      <button
        type="button"
        aria-label={`${task.title} bearbeiten`}
        onClick={() => onEdit(task)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted"
      >
        <Pencil aria-hidden />
      </button>
    </li>
  )
}
