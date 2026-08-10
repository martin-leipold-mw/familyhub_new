import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { getListTasksQueryKey } from '@/api/generated/endpoints/familyHubAPI'
import type { TaskResponse } from '@/api/generated/model'
import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { MemberTaskCard } from './MemberTaskCard'
import { TaskFilterBar } from './TaskFilterBar'
import { TaskDialog } from './TaskDialog'
import { TasksScopeNotice } from './TasksScopeNotice'
import { useTasks, useUpdateTaskMutation } from './useTasks'
import { useTaskSync } from './useTaskSync'
import { taskProgress } from './progress'
import type { TaskFilter, SortMode } from './taskSort'

const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: 'due', label: 'Nach Fälligkeit' },
  { value: 'priority', label: 'Nach Priorität' },
]

type DialogState = { memberId: string; task: TaskResponse | null }

export function TasksView() {
  const queryClient = useQueryClient()
  const { tasks, isLoading, isError } = useTasks()
  const { members } = useMembers()
  const { connections } = useGoogleConnections()
  const { sync, isSyncing, isError: syncFailed } = useTaskSync()
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [sortMode, setSortMode] = useState<SortMode>('due')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const updateMutation = useUpdateTaskMutation()
  const today = new Date()

  // Zähler IMMER über den Gesamtbestand — nie über die gefilterte Teilmenge (FA-AUF-06).
  const { done, total } = taskProgress(tasks)
  const counts = { all: total, open: total - done, done }

  // Nur Mitglieder mit Google-Verbindung bekommen eine Karte: Owner = Mitglied der Verbindung.
  const memberIdsWithConnection = new Set(connections.map((c) => c.memberId))
  const cardMembers = members.filter((m) => memberIdsWithConnection.has(m.id))

  function handleToggle(task: TaskResponse) {
    const next = task.status === 'completed' ? 'pending' : 'completed'
    void updateMutation.mutateAsync({ id: task.id, data: { status: next } })
  }

  function handleRetry() {
    void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() })
  }

  return (
    <div className="min-h-screen bg-bg p-4 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary mr-auto">Aufgaben</h1>
        <p className="text-muted">{`${done} von ${total} erledigt`}</p>
        <button
          type="button"
          aria-label="Synchronisieren"
          onClick={() => void sync()}
          disabled={isSyncing}
          className="rounded-xl bg-surface-2 px-4 py-3 min-h-[44px] min-w-[44px] text-primary disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={isSyncing ? 'animate-spin' : ''} />
        </button>
      </header>

      <TasksScopeNotice connections={connections} />

      {syncFailed && <p className="text-danger">Synchronisierung fehlgeschlagen.</p>}

      {connections.length === 0 && (
        <p className="text-muted">Kein Google-Konto verbunden. Aufgaben werden aus Google Tasks synchronisiert.</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <TaskFilterBar filter={filter} counts={counts} onChange={setFilter} />
        <div className="flex gap-2">
          {SORT_MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={sortMode === value}
              onClick={() => setSortMode(value)}
              className={`min-h-[44px] px-4 rounded-full ${
                sortMode === value ? 'bg-accent text-white' : 'bg-surface text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-3 rounded-xl bg-danger-weak p-3">
          <span className="text-danger">Fehler beim Laden der Aufgaben.</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-danger px-3 py-2 min-h-[44px] text-white"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Wird geladen…</p>}

      {!isLoading && !isError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cardMembers.map((member) => (
            <MemberTaskCard
              key={member.id}
              member={member}
              tasks={tasks.filter((t) => t.memberId === member.id)}
              filter={filter}
              sortMode={sortMode}
              today={today}
              onToggle={handleToggle}
              onEdit={(task) => setDialog({ memberId: task.memberId, task })}
              onAdd={(memberId) => setDialog({ memberId, task: null })}
            />
          ))}
        </div>
      )}

      {dialog && (
        <TaskDialog task={dialog.task} memberId={dialog.memberId} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
