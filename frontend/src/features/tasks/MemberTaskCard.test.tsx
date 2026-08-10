import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MemberResponse, TaskResponse } from '@/api/generated/model'
import { MemberTaskCard } from './MemberTaskCard'

const today = new Date('2026-08-10T12:00:00Z')

const member: MemberResponse = {
  id: 'mem-1',
  name: 'Anna',
  role: 'child',
  color: 'blue',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function task(overrides: Partial<TaskResponse> & { id: string }): TaskResponse {
  return {
    id: overrides.id,
    memberId: member.id,
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? 'pending',
    dueDate: overrides.dueDate,
    priority: overrides.priority,
    notes: overrides.notes,
    completedAt: overrides.completedAt,
  }
}

function renderCard(
  tasks: TaskResponse[],
  overrides: Partial<{
    filter: 'all' | 'open' | 'done'
    sortMode: 'due' | 'priority'
    onToggle: (t: TaskResponse) => void
    onEdit: (t: TaskResponse) => void
    onAdd: (memberId: string) => void
    memberOverride: MemberResponse
  }> = {},
) {
  render(
    <MemberTaskCard
      member={overrides.memberOverride ?? member}
      tasks={tasks}
      filter={overrides.filter ?? 'all'}
      sortMode={overrides.sortMode ?? 'due'}
      today={today}
      onToggle={overrides.onToggle ?? vi.fn()}
      onEdit={overrides.onEdit ?? vi.fn()}
      onAdd={overrides.onAdd ?? vi.fn()}
    />,
  )
}

describe('MemberTaskCard', () => {
  it('renders the member name and the completion subtitle', () => {
    renderCard([
      task({ id: 'a', status: 'completed' }),
      task({ id: 'b', status: 'pending' }),
    ])
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('1/2 erledigt')).toBeInTheDocument()
  })

  it('renders the avatar image when the member has one', () => {
    renderCard([], { memberOverride: { ...member, avatarUrl: 'http://x/anna.png' } })
    expect(screen.getByAltText('Anna')).toHaveAttribute('src', 'http://x/anna.png')
  })

  it('renders the initial letter when the member has no avatar', () => {
    renderCard([])
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders the empty state when the member has no tasks', () => {
    renderCard([])
    expect(screen.getByText('Keine Aufgaben')).toBeInTheDocument()
  })

  it('renders the empty state when the filter removes every task', () => {
    renderCard([task({ id: 'a', status: 'pending' })], { filter: 'done' })
    expect(screen.getByText('Keine Aufgaben')).toBeInTheDocument()
  })

  it('renders one row per task after filtering', () => {
    renderCard(
      [
        task({ id: 'a', title: 'Einkaufen', status: 'pending' }),
        task({ id: 'b', title: 'Müll', status: 'completed' }),
      ],
      { filter: 'open' },
    )
    expect(screen.getByText('Einkaufen')).toBeInTheDocument()
    expect(screen.queryByText('Müll')).not.toBeInTheDocument()
  })

  it('sorts rows by the given sort mode', () => {
    renderCard(
      [
        task({ id: 'a', title: 'Niedrig', priority: 'low', dueDate: '2026-08-20' }),
        task({ id: 'b', title: 'Hoch', priority: 'high', dueDate: '2026-08-10' }),
      ],
      { sortMode: 'priority' },
    )
    const titles = screen.getAllByText(/Niedrig|Hoch/).map((el) => el.textContent)
    expect(titles).toEqual(['Hoch', 'Niedrig'])
  })

  it('calls onAdd with the member id', async () => {
    const onAdd = vi.fn()
    renderCard([], { onAdd })
    await userEvent.click(screen.getByRole('button', { name: 'Aufgabe hinzufügen' }))
    expect(onAdd).toHaveBeenCalledWith('mem-1')
  })
})
