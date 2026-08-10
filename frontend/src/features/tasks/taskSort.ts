import type { TaskResponse } from '@/api/generated/model'

export type SortMode = 'due' | 'priority'
export type TaskFilter = 'all' | 'open' | 'done'

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

function byDue(a: TaskResponse, b: TaskResponse): number {
  // '9999-12-31' sortiert datumslose Aufgaben ans Ende, ohne einen Extra-Zweig zu brauchen.
  const left = a.dueDate ?? '9999-12-31'
  const right = b.dueDate ?? '9999-12-31'
  return left === right ? a.title.localeCompare(b.title, 'de') : left.localeCompare(right)
}

function byPriority(a: TaskResponse, b: TaskResponse): number {
  const left = PRIORITY_RANK[a.priority ?? ''] ?? 3
  const right = PRIORITY_RANK[b.priority ?? ''] ?? 3
  return left === right ? a.title.localeCompare(b.title, 'de') : left - right
}

export function sortTasks(tasks: TaskResponse[], mode: SortMode): TaskResponse[] {
  return [...tasks].sort(mode === 'due' ? byDue : byPriority)
}

export function filterTasks(tasks: TaskResponse[], filter: TaskFilter): TaskResponse[] {
  if (filter === 'open') return tasks.filter((t) => t.status === 'pending')
  if (filter === 'done') return tasks.filter((t) => t.status === 'completed')
  return tasks
}
