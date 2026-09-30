import { describe, it, expect } from 'vitest'
import type { ChoreResponse, MemberResponse } from '@/api/generated/model'
import { choreStatus, groupPoolSize } from './choreStatus'

const TODAY = '2026-09-22'

function member(id: string, role: 'parent' | 'child', isActive = true): MemberResponse {
  return { id, name: id, role, color: 'blue', isActive, createdAt: '', updatedAt: '' }
}

const papa = member('papa', 'parent')
const anna = member('anna', 'child')

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'all',
    points: 10,
    isActive: true,
    nextDueOn: TODAY,
    ...overrides,
  }
}

function open(memberName: string, assignedOn: string) {
  return { id: 'a1', memberId: 'm1', memberName, assignedOn }
}

// ─── groupPoolSize ──────────────────────────────────────────────────────────

describe('groupPoolSize', () => {
  it('zaehlt bei parents nur Eltern', () => {
    expect(groupPoolSize('parents', [papa, anna])).toBe(1)
  })

  it('zaehlt bei children nur Kinder', () => {
    expect(groupPoolSize('children', [papa, anna])).toBe(1)
  })

  it('zaehlt bei all alle', () => {
    expect(groupPoolSize('all', [papa, anna])).toBe(2)
  })

  it('laesst inaktive Mitglieder weg', () => {
    expect(groupPoolSize('all', [papa, member('ben', 'child', false)])).toBe(1)
  })
})

// ─── choreStatus ────────────────────────────────────────────────────────────

describe('choreStatus', () => {
  it('meldet eine pausierte Vorlage, noch vor allem anderen', () => {
    const status = choreStatus(chore({ isActive: false, openAssignment: open('Anna', TODAY) }), [anna], TODAY)

    expect(status).toEqual({ text: 'Pausiert', tone: 'paused' })
  })

  it('nennt den Traeger einer heute ausgegebenen Aufgabe', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', TODAY) }), [anna], TODAY)

    expect(status).toEqual({ text: 'Offen bei Anna · seit heute', tone: 'open' })
  })

  it('setzt bei einem Tag die Einzahl', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', '2026-09-21') }), [anna], TODAY)

    expect(status.text).toBe('Offen bei Anna · seit 1 Tag')
  })

  it('zaehlt aeltere Aufgaben in Tagen', () => {
    const status = choreStatus(chore({ openAssignment: open('Anna', '2026-09-18') }), [anna], TODAY)

    expect(status.text).toBe('Offen bei Anna · seit 4 Tagen')
  })

  it('kuendigt eine morgen faellige Vorlage an', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-23' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wieder fällig morgen', tone: 'due' })
  })

  it('zaehlt die Tage bis zur naechsten Faelligkeit', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-29' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wieder fällig in 7 Tagen', tone: 'due' })
  })

  it('erklaert eine leere Zuweisungsgruppe', () => {
    const status = choreStatus(chore({ assignmentGroup: 'children' }), [papa], TODAY)

    expect(status).toEqual({ text: 'Keine Mitglieder in dieser Gruppe', tone: 'blocked' })
  })

  it('erklaert eine faellige Vorlage ohne freien Platz', () => {
    const status = choreStatus(chore({ nextDueOn: '2026-09-20' }), [anna], TODAY)

    expect(status).toEqual({ text: 'Wartet auf freien Platz', tone: 'waiting' })
  })

  it('behandelt eine heute faellige Vorlage wie eine wartende', () => {
    const status = choreStatus(chore({ nextDueOn: TODAY }), [anna], TODAY)

    expect(status.tone).toBe('waiting')
  })
})
