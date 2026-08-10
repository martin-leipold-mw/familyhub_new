import { describe, it, expect } from 'vitest'
import type { TaskResponse } from '@/api/generated/model'
import { taskProgress } from './progress'

function task(id: string, status: TaskResponse['status']): TaskResponse {
  return { id, memberId: 'member-1', title: id, status }
}

describe('taskProgress', () => {
  it('returns zeros for an empty list', () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })

  it('reports 100 percent when all tasks are completed', () => {
    const tasks = [task('a', 'completed'), task('b', 'completed')]
    expect(taskProgress(tasks)).toEqual({ done: 2, total: 2, percent: 100 })
  })

  it('reports a rounded percentage for a partial completion', () => {
    const tasks = [task('a', 'completed'), task('b', 'pending'), task('c', 'pending')]
    expect(taskProgress(tasks)).toEqual({ done: 1, total: 3, percent: 33 })
  })

  it('reports 0 percent when nothing is completed', () => {
    const tasks = [task('a', 'pending'), task('b', 'pending')]
    expect(taskProgress(tasks)).toEqual({ done: 0, total: 2, percent: 0 })
  })
})
