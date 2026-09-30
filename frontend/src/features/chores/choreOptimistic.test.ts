import { describe, it, expect } from 'vitest'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { patchAssignment } from './choreOptimistic'

function assignment(id: string): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId: 'm1',
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
  }
}

describe('patchAssignment', () => {
  it('aendert genau die getroffene Zuweisung', () => {
    const cache = { data: [assignment('a1'), assignment('a2')] }

    const next = patchAssignment(cache, 'a1', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' })

    expect(next!.data[0].status).toBe('completed')
    expect(next!.data[0].completedAt).toBe('2026-09-22T09:00:00Z')
    expect(next!.data[1].status).toBe('open')
  })

  it('laesst den urspruenglichen Cache unveraendert', () => {
    const cache = { data: [assignment('a1')] }

    patchAssignment(cache, 'a1', { status: 'completed' })

    expect(cache.data[0].status).toBe('open')
  })

  it('reicht einen leeren Cache unveraendert durch', () => {
    expect(patchAssignment(undefined, 'a1', { status: 'completed' })).toBeUndefined()
  })
})
