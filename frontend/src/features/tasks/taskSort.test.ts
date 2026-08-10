import { describe, it, expect } from 'vitest'
import type { TaskResponse } from '@/api/generated/model'
import { sortTasks, filterTasks } from './taskSort'

function task(overrides: Partial<TaskResponse> & { id: string }): TaskResponse {
  return {
    id: overrides.id,
    memberId: 'member-1',
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? 'pending',
    dueDate: overrides.dueDate,
    priority: overrides.priority,
    notes: overrides.notes,
    completedAt: overrides.completedAt,
  }
}

describe('sortTasks', () => {
  it('sorts by due date ascending', () => {
    const tasks = [
      task({ id: 'c', dueDate: '2026-08-20' }),
      task({ id: 'a', dueDate: '2026-08-05' }),
      task({ id: 'b', dueDate: '2026-08-10' }),
    ]
    expect(sortTasks(tasks, 'due').map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts tasks without a due date last', () => {
    const withDate = task({ id: 'a', title: 'A', dueDate: '2026-08-01' })
    const withoutDate = task({ id: 'b', title: 'B', dueDate: undefined })
    // Both argument orders exercise both sides of the `dueDate ?? fallback` guard.
    expect(sortTasks([withoutDate, withDate], 'due').map((t) => t.id)).toEqual(['a', 'b'])
    expect(sortTasks([withDate, withoutDate], 'due').map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('breaks ties by title', () => {
    const tasks = [
      task({ id: 'z', title: 'Zebra', dueDate: '2026-08-05' }),
      task({ id: 'a', title: 'Apfel', dueDate: '2026-08-05' }),
    ]
    expect(sortTasks(tasks, 'due').map((t) => t.id)).toEqual(['a', 'z'])
  })

  it('sorts by priority high, medium, low when mode is priority', () => {
    const tasks = [
      task({ id: 'low', priority: 'low' }),
      task({ id: 'high', priority: 'high' }),
      task({ id: 'medium', priority: 'medium' }),
    ]
    expect(sortTasks(tasks, 'priority').map((t) => t.id)).toEqual(['high', 'medium', 'low'])
  })

  it('puts tasks without a priority last in priority mode', () => {
    const withPriority = task({ id: 'a', title: 'A', priority: 'high' })
    const withoutPriority = task({ id: 'b', title: 'B', priority: undefined })
    // Both argument orders exercise both sides of the `priority ?? ''` and `rank ?? 3` guards.
    expect(sortTasks([withoutPriority, withPriority], 'priority').map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
    expect(sortTasks([withPriority, withoutPriority], 'priority').map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('breaks priority ties by title', () => {
    const tasks = [
      task({ id: 'z', title: 'Zebra', priority: 'medium' }),
      task({ id: 'a', title: 'Apfel', priority: 'medium' }),
    ]
    expect(sortTasks(tasks, 'priority').map((t) => t.id)).toEqual(['a', 'z'])
  })

  it('returns a new array and leaves the input untouched', () => {
    const tasks = [
      task({ id: 'b', dueDate: '2026-08-10' }),
      task({ id: 'a', dueDate: '2026-08-05' }),
    ]
    const result = sortTasks(tasks, 'due')
    expect(result).not.toBe(tasks)
    expect(tasks.map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'a', status: 'pending' }),
    task({ id: 'b', status: 'completed' }),
  ]

  it('returns everything for all', () => {
    expect(filterTasks(tasks, 'all').map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('returns only pending tasks for open', () => {
    expect(filterTasks(tasks, 'open').map((t) => t.id)).toEqual(['a'])
  })

  it('returns only completed tasks for done', () => {
    expect(filterTasks(tasks, 'done').map((t) => t.id)).toEqual(['b'])
  })
})
