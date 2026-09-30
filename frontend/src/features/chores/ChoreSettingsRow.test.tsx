import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChoreResponse } from '@/api/generated/model'
import { ChoreSettingsRow } from './ChoreSettingsRow'

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'children',
    points: 10,
    isActive: true,
    nextDueOn: '2026-09-29',
    ...overrides,
  }
}

const status = { text: 'Wieder fällig in 7 Tagen', tone: 'due' as const }

describe('ChoreSettingsRow', () => {
  it('zeigt Emoji, Name und die Konfigurationszeile', () => {
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={vi.fn()} />)

    expect(screen.getByText('🚽')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
    expect(screen.getByText('Wöchentlich · Kinder · 10 Pkt.')).toBeInTheDocument()
  })

  it('zeigt den Zustandstext', () => {
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={vi.fn()} />)

    expect(screen.getByText('Wieder fällig in 7 Tagen')).toBeInTheDocument()
  })

  it('bietet einer aktiven Vorlage Pausieren an', async () => {
    const onToggleActive = vi.fn()
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={vi.fn()} onToggleActive={onToggleActive} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen pausieren' }))

    expect(onToggleActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), false)
  })

  it('bietet einer pausierten Vorlage Aktivieren an', async () => {
    const onToggleActive = vi.fn()
    render(
      <ChoreSettingsRow
        chore={chore({ isActive: false })}
        status={{ text: 'Pausiert', tone: 'paused' }}
        onEdit={vi.fn()}
        onToggleActive={onToggleActive}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen aktivieren' }))

    expect(onToggleActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), true)
  })

  it('oeffnet den Bearbeiten-Dialog', async () => {
    const onEdit = vi.fn()
    render(<ChoreSettingsRow chore={chore()} status={status} onEdit={onEdit} onToggleActive={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen bearbeiten' }))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })
})
