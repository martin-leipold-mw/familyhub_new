import type { TaskFilter } from './taskSort'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'done', label: 'Erledigt' },
]

type TaskFilterBarProps = {
  filter: TaskFilter
  counts: { all: number; open: number; done: number }
  onChange: (f: TaskFilter) => void
}

export function TaskFilterBar({ filter, counts, onChange }: TaskFilterBarProps) {
  return (
    <div className="flex gap-2">
      {FILTERS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          onClick={() => onChange(value)}
          className={`min-h-[44px] px-4 rounded-full ${
            filter === value ? 'bg-accent text-white' : 'bg-surface text-primary'
          }`}
        >
          {label} {counts[value]}
        </button>
      ))}
    </div>
  )
}
