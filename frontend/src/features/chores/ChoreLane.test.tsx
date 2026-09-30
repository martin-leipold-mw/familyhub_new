import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'
import type { ChoreLaneModel } from './choreLanes'
import { ChoreLane, COMPLETE_LOCKOUT_MS } from './ChoreLane'

const member: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function assignment(id: string, overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id,
    choreId: `c-${id}`,
    memberId: 'm1',
    name: `Aufgabe ${id}`,
    icon: '🧹',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

function lane(overrides: Partial<ChoreLaneModel> = {}): ChoreLaneModel {
  return { member, open: [], completed: [], ...overrides }
}

const now = new Date('2026-09-22T09:02:00Z')

describe('ChoreLane', () => {
  it('zeigt den Namen des Mitglieds', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('feiert eine leere Liste', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('Alles erledigt! 🎉')).toBeInTheDocument()
  })

  it('zaehlt die offenen Aufgaben', () => {
    render(
      <ChoreLane
        lane={lane({ open: [assignment('a1'), assignment('a2')] })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByText('2 offen')).toBeInTheDocument()
  })

  it('zeigt bei genau einer Aufgabe die Einzahl', () => {
    render(<ChoreLane lane={lane({ open: [assignment('a1')] })} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('1 offen')).toBeInTheDocument()
  })

  it('stellt erledigte Aufgaben hinter die offenen', () => {
    render(
      <ChoreLane
        lane={lane({
          open: [assignment('offen', { name: 'Noch offen' })],
          completed: [
            assignment('fertig', { name: 'Schon fertig', status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
          ],
        })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Noch offen')
    expect(items[1]).toHaveTextContent('Schon fertig')
  })

  it('bietet Rueckgaengig nur innerhalb der Frist an', () => {
    render(
      <ChoreLane
        lane={lane({
          completed: [
            assignment('frisch', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' }),
            assignment('alt', { status: 'completed', completedAt: '2026-09-22T08:00:00Z' }),
          ],
        })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Rückgängig' })).toHaveLength(1)
  })

  it('zeigt den Avatar, wenn einer hinterlegt ist', () => {
    render(
      <ChoreLane
        lane={lane({ member: { ...member, avatarUrl: '/api/v1/members/m1/avatar' } })}
        now={now}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Anna' })).toBeInTheDocument()
  })

  it('zeigt sonst den Anfangsbuchstaben', () => {
    render(<ChoreLane lane={lane()} now={now} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('A')).toBeInTheDocument()
  })

  describe('Sperre gegen Doppeltippen', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('ignoriert einen zweiten Haken in derselben Spalte innerhalb der Sperrfrist', () => {
      const onComplete = vi.fn()
      render(
        <ChoreLane
          lane={lane({ open: [assignment('a1'), assignment('a2')] })}
          now={now}
          onComplete={onComplete}
          onUndo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a1 erledigt' }))
      act(() => {
        vi.advanceTimersByTime(COMPLETE_LOCKOUT_MS - 1)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a2 erledigt' }))

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith('a1')
    })

    it('laesst einen Haken nach Ablauf der Sperrfrist durch', () => {
      const onComplete = vi.fn()
      render(
        <ChoreLane
          lane={lane({ open: [assignment('a1'), assignment('a2')] })}
          now={now}
          onComplete={onComplete}
          onUndo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a1 erledigt' }))
      act(() => {
        vi.advanceTimersByTime(COMPLETE_LOCKOUT_MS)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a2 erledigt' }))

      expect(onComplete).toHaveBeenNthCalledWith(1, 'a1')
      expect(onComplete).toHaveBeenNthCalledWith(2, 'a2')
    })

    it('sperrt andere Spalten nicht mit', () => {
      const onComplete = vi.fn()
      const ben: MemberResponse = { ...member, id: 'm2', name: 'Ben' }
      render(
        <>
          <ChoreLane lane={lane({ open: [assignment('a1')] })} now={now} onComplete={onComplete} onUndo={vi.fn()} />
          <ChoreLane
            lane={lane({ member: ben, open: [assignment('b1', { memberId: 'm2' })] })}
            now={now}
            onComplete={onComplete}
            onUndo={vi.fn()}
          />
        </>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a1 erledigt' }))
      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe b1 erledigt' }))

      expect(onComplete).toHaveBeenNthCalledWith(1, 'a1')
      expect(onComplete).toHaveBeenNthCalledWith(2, 'b1')
    })

    it('sperrt Rueckgaengig nicht', () => {
      const onUndo = vi.fn()
      render(
        <ChoreLane
          lane={lane({
            open: [assignment('a1')],
            completed: [assignment('fertig', { status: 'completed', completedAt: '2026-09-22T09:00:00Z' })],
          })}
          now={new Date('2026-09-22T09:00:30Z')}
          onComplete={vi.fn()}
          onUndo={onUndo}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe a1 erledigt' }))
      fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

      expect(onUndo).toHaveBeenCalledWith('fertig')
    })
  })
})
