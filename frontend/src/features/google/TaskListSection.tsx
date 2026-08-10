import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ConnectionResponse, TaskListResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllTaskLists,
  useTaskListsForMember,
  useSaveSelectedTaskListsMutation,
} from '@/features/tasks/useTaskLists'
import { TasksScopeNotice } from '@/features/tasks/TasksScopeNotice'

function ConnectionTaskLists({ connection }: { connection: ConnectionResponse }) {
  const { taskLists, isLoading, isError } = useTaskListsForMember(connection.memberId)
  const saveMutation = useSaveSelectedTaskListsMutation()

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    taskLists.filter((t) => t.isSelected).map((t) => t.id),
  )
  const [writeTargetId, setWriteTargetId] = useState<string | null>(
    () => taskLists.find((t) => t.isWriteTarget)?.id ?? null,
  )

  useEffect(() => {
    setSelectedIds(taskLists.filter((t) => t.isSelected).map((t) => t.id))
    setWriteTargetId(taskLists.find((t) => t.isWriteTarget)?.id ?? null)
  }, [taskLists])

  function handleToggle(taskListId: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, taskListId] : prev.filter((id) => id !== taskListId)))
    // The backend silently ignores a write target that is no longer selected
    // (it resolves to null rather than rejecting the request), so deselecting
    // the current write target clears it here rather than sending a
    // combination that would be quietly dropped.
    if (!checked && writeTargetId === taskListId) {
      setWriteTargetId(null)
    }
  }

  function handleSelectWriteTarget(taskListId: string) {
    setWriteTargetId(taskListId)
    // The backend silently ignores a write target that isn't among the selected
    // list ids (it resolves to null rather than rejecting the request), so
    // choosing a target implicitly selects its list rather than leaving the
    // user free to create a combination that would be quietly dropped.
    setSelectedIds((prev) => (prev.includes(taskListId) ? prev : [...prev, taskListId]))
  }

  async function handleSave() {
    await saveMutation.mutateAsync({
      data: { memberId: connection.memberId, taskListIds: selectedIds, writeTargetId },
    })
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-medium text-primary mb-2">{connection.name} – Aufgabenlisten</h3>

      {isLoading && <p className="text-muted">Wird geladen…</p>}
      {isError && <p className="text-danger">Fehler beim Laden der Aufgabenlisten.</p>}
      {!isLoading && !isError && taskLists.length === 0 && (
        <p className="text-muted">Keine Aufgabenlisten gefunden.</p>
      )}

      {!isLoading && !isError && taskLists.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {taskLists.map((taskList: TaskListResponse) => (
            <li key={taskList.id} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(taskList.id)}
                  onChange={(e) => handleToggle(taskList.id, e.target.checked)}
                  className="w-5 h-5"
                />
                {taskList.title}
              </label>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <input
                  type="radio"
                  aria-label="Zielliste für neue Aufgaben"
                  name={`write-target-tasks-${connection.connectionId}`}
                  checked={writeTargetId === taskList.id}
                  onChange={() => handleSelectWriteTarget(taskList.id)}
                  className="w-5 h-5"
                />
                Zielliste
              </label>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && (
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-accent px-4 py-2 min-h-[44px] text-white"
        >
          Speichern
        </button>
      )}
    </div>
  )
}

export function TaskListSection() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { taskLists } = useAllTaskLists()
  const [open, setOpen] = useState(false)
  const selectedCount = taskLists.filter((t) => t.isSelected).length

  if (isLoading) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-muted">Wird geladen…</p>
      </section>
    )
  }

  if (isError) {
    return (
      <section className="rounded-2xl bg-surface border border-subtle p-4">
        <p className="text-danger">Fehler beim Laden der Aufgabenlisten.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-surface border border-subtle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 min-h-[44px]"
      >
        <span className="text-xl font-semibold text-primary">Aufgabenlisten · {selectedCount} ausgewählt</span>
        {open ? <ChevronDown aria-hidden className="text-muted" /> : <ChevronRight aria-hidden className="text-muted" />}
      </button>
      {open && (
        <div className="p-4 pt-0">
          <TasksScopeNotice connections={connections} />
          {connections.length === 0 ? (
            <p className="text-muted">Keine Google-Konten verbunden.</p>
          ) : (
            connections.map((connection) => (
              <ConnectionTaskLists key={connection.connectionId} connection={connection} />
            ))
          )}
        </div>
      )}
    </section>
  )
}
