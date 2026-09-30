import { describe, it, expect } from 'vitest'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'
import { buildChoreLanes } from './choreLanes'

function member(id: string, name: string, isActive = true): MemberResponse {
  return { id, name, role: 'child', color: 'pink', isActive, createdAt: '', updatedAt: '' }
}

function assignment(
  id: string,
  memberId: string,
  overrides: Partial<ChoreAssignmentResponse> = {},
): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId,
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

describe('buildChoreLanes', () => {
  it('legt fuer jedes aktive Mitglied eine Lane an, auch ohne Aufgaben', () => {
    const lanes = buildChoreLanes([member('m1', 'Anna'), member('m2', 'Ben')], [])

    expect(lanes.map((l) => l.member.id)).toEqual(['m1', 'm2'])
    expect(lanes[0].open).toEqual([])
    expect(lanes[0].completed).toEqual([])
  })

  it('laesst inaktive Mitglieder weg', () => {
    const lanes = buildChoreLanes([member('m1', 'Anna'), member('m2', 'Ben', false)], [])

    expect(lanes.map((l) => l.member.id)).toEqual(['m1'])
  })

  it('ordnet jede Zuweisung ihrem Mitglied zu', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna'), member('m2', 'Ben')],
      [assignment('a1', 'm1'), assignment('a2', 'm2')],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['a1'])
    expect(lanes[1].open.map((a) => a.id)).toEqual(['a2'])
  })

  it('trennt offene von erledigten Aufgaben', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('a1', 'm1'),
        assignment('a2', 'm1', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['a1'])
    expect(lanes[0].completed.map((a) => a.id)).toEqual(['a2'])
  })

  it('sortiert nach Ausgabetag, die aelteste zuerst', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('neu', 'm1', { assignedOn: '2026-09-22' }),
        assignment('alt', 'm1', { assignedOn: '2026-09-18' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.id)).toEqual(['alt', 'neu'])
  })

  it('sortiert bei gleichem Ausgabetag nach Name', () => {
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('a1', 'm1', { name: 'Zähne putzen' }),
        assignment('a2', 'm1', { name: 'Bad putzen' }),
      ],
    )

    expect(lanes[0].open.map((a) => a.name)).toEqual(['Bad putzen', 'Zähne putzen'])
  })

  it('sortiert auch die erledigten Aufgaben', () => {
    const done = { status: 'completed' as const, completedAt: '2026-09-22T09:00:00Z' }
    const lanes = buildChoreLanes(
      [member('m1', 'Anna')],
      [
        assignment('neu', 'm1', { ...done, assignedOn: '2026-09-22' }),
        assignment('alt', 'm1', { ...done, assignedOn: '2026-09-18' }),
      ],
    )

    expect(lanes[0].completed.map((a) => a.id)).toEqual(['alt', 'neu'])
  })
})
