import type { TaskResponse } from '@/api/generated/model'

export function taskProgress(tasks: TaskResponse[]): { done: number; total: number; percent: number } {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'completed').length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}
