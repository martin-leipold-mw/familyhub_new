import { Plus } from 'lucide-react'
import type { MemberResponse, TaskResponse } from '@/api/generated/model'
import { memberColorHex } from '@/features/members/colors'
import { ProgressRing } from './ProgressRing'
import { TaskRow } from './TaskRow'
import { filterTasks, sortTasks, type TaskFilter, type SortMode } from './taskSort'
import { taskProgress } from './progress'

type MemberTaskCardProps = {
  member: MemberResponse
  tasks: TaskResponse[]
  filter: TaskFilter
  sortMode: SortMode
  today: Date
  onToggle: (task: TaskResponse) => void
  onEdit: (task: TaskResponse) => void
  onAdd: (memberId: string) => void
}

export function MemberTaskCard({
  member,
  tasks,
  filter,
  sortMode,
  today,
  onToggle,
  onEdit,
  onAdd,
}: MemberTaskCardProps) {
  const color = memberColorHex(member.color)
  // Kopf/Untertitel zeigen den Fortschritt über den GESAMTBESTAND der Karte — nur die
  // Zeilenliste darunter wird gefiltert/sortiert (siehe Task-Brief Step 4).
  const { done, total, percent } = taskProgress(tasks)
  const rows = sortTasks(filterTasks(tasks, filter), sortMode)

  return (
    <section className="rounded-2xl bg-surface-2 overflow-hidden">
      <header className="flex items-center gap-3 p-4" style={{ backgroundColor: color }}>
        <span className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center overflow-hidden bg-white/40">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-slate-900">{member.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-lg font-semibold text-slate-900 truncate">{member.name}</span>
          <span className="block text-sm text-slate-900/80">{`${done}/${total} erledigt`}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface p-1">
          <ProgressRing percent={percent} />
        </span>
      </header>

      <div className="p-4 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-muted">Keine Aufgaben</p>
        ) : (
          <ul className="flex flex-col divide-y divide-subtle">
            {rows.map((task) => (
              <TaskRow key={task.id} task={task} color={color} today={today} onToggle={onToggle} onEdit={onEdit} />
            ))}
          </ul>
        )}

        <button
          type="button"
          aria-label="Aufgabe hinzufügen"
          onClick={() => onAdd(member.id)}
          className="min-h-[44px] w-full flex items-center justify-center gap-2 rounded-xl bg-surface text-primary"
        >
          <Plus aria-hidden />
          Aufgabe
        </button>
      </div>
    </section>
  )
}
