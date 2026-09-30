import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { ChoreCard } from './ChoreCard'

function assignment(overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id: 'a1',
    choreId: 'c1',
    memberId: 'm1',
    name: 'Toilette putzen',
    icon: '🚽',
    description: 'Auch den Spiegel!',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

describe('ChoreCard', () => {
  it('zeigt Emoji, Name und Beschreibung', () => {
    render(<ChoreCard assignment={assignment()} color="#f0f" undoable={false} onComplete={vi.fn()} onUndo={vi.fn()} />)

    expect(screen.getByText('🚽')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
    expect(screen.getByText('Auch den Spiegel!')).toBeInTheDocument()
  })

  it('laesst die Beschreibung weg, wenn keine gepflegt ist', () => {
    render(
      <ChoreCard
        assignment={assignment({ description: null })}
        color="#f0f"
        undoable={false}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('chore-description')).not.toBeInTheDocument()
  })

  it('meldet einen Tipp auf das Abhak-Feld', async () => {
    const onComplete = vi.fn()
    render(<ChoreCard assignment={assignment()} color="#f0f" undoable={false} onComplete={onComplete} onUndo={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(onComplete).toHaveBeenCalledWith('a1')
  })

  it('stellt eine erledigte Aufgabe durchgestrichen dar', () => {
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable={false}
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.getByText('Toilette putzen')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).not.toBeInTheDocument()
  })

  it('bietet innerhalb der Frist Rueckgaengig an', async () => {
    const onUndo = vi.fn()
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable
        onComplete={vi.fn()}
        onUndo={onUndo}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(onUndo).toHaveBeenCalledWith('a1')
  })

  it('zeigt bei einer erledigten Aufgabe kein Abhak-Feld mehr', () => {
    render(
      <ChoreCard
        assignment={assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })}
        color="#f0f"
        undoable
        onComplete={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Toilette putzen erledigt' })).not.toBeInTheDocument()
  })
})
