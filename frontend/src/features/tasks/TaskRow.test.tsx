import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskResponse } from '@/api/generated/model'
import { TaskRow } from './TaskRow'

const today = new Date('2026-08-10T12:00:00Z')

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

function renderRow(t: TaskResponse, onToggle = vi.fn(), onEdit = vi.fn()) {
  render(
    <ul>
      <TaskRow task={t} color="#3366ff" today={today} onToggle={onToggle} onEdit={onEdit} />
    </ul>,
  )
}

describe('TaskRow', () => {
  it('renders the title', () => {
    renderRow(task({ id: 'a', title: 'Einkaufen' }))
    expect(screen.getByText('Einkaufen')).toBeInTheDocument()
  })

  it('renders notes when present', () => {
    renderRow(task({ id: 'a', notes: 'Milch, Brot' }))
    expect(screen.getByText('Milch, Brot')).toBeInTheDocument()
    expect(screen.getByTestId('task-notes')).toBeInTheDocument()
  })

  it('renders no notes line when notes are null', () => {
    renderRow(task({ id: 'a', notes: null }))
    expect(screen.queryByTestId('task-notes')).toBeNull()
  })

  it('renders the due label when a due date is set', () => {
    renderRow(task({ id: 'a', dueDate: '2026-08-10' }))
    expect(screen.getByTestId('due-label')).toBeInTheDocument()
    expect(screen.getByText('Heute')).toBeInTheDocument()
  })

  it('renders no due label without a due date', () => {
    renderRow(task({ id: 'a', dueDate: null, priority: undefined }))
    expect(screen.queryByTestId('due-label')).toBeNull()
  })

  it('renders three stars for high priority', () => {
    renderRow(task({ id: 'a', priority: 'high' }))
    expect(screen.getByLabelText('Priorität high')).toHaveTextContent('⭐⭐⭐')
  })

  it('renders two stars for medium priority', () => {
    renderRow(task({ id: 'a', priority: 'medium' }))
    expect(screen.getByLabelText('Priorität medium')).toHaveTextContent('⭐⭐')
  })

  it('renders one star for low priority', () => {
    renderRow(task({ id: 'a', priority: 'low' }))
    expect(screen.getByLabelText('Priorität low')).toHaveTextContent('⭐')
  })

  it('renders no stars without a priority', () => {
    renderRow(task({ id: 'a', priority: undefined, dueDate: null }))
    expect(screen.queryByLabelText(/Priorität/)).toBeNull()
  })

  it('strikes through and dims a completed task', () => {
    renderRow(task({ id: 'a', title: 'Rasen mähen', status: 'completed' }))
    expect(screen.getByRole('button', { name: 'Rasen mähen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('calls onToggle when the checkbox is pressed', async () => {
    const onToggle = vi.fn()
    const t = task({ id: 'a', title: 'Einkaufen' })
    renderRow(t, onToggle)
    await userEvent.click(screen.getByRole('button', { name: 'Einkaufen' }))
    expect(onToggle).toHaveBeenCalledWith(t)
  })

  it('calls onEdit when the edit button is pressed', async () => {
    const onEdit = vi.fn()
    const t = task({ id: 'a', title: 'Einkaufen' })
    renderRow(t, vi.fn(), onEdit)
    await userEvent.click(screen.getByRole('button', { name: 'Einkaufen bearbeiten' }))
    expect(onEdit).toHaveBeenCalledWith(t)
  })
})
