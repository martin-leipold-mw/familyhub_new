import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { TaskDialog } from './TaskDialog'
import type { TaskResponse } from '@/api/generated/model'

const createMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
let createPending = false
let updatePending = false

vi.mock('./useTasks', async () => {
  const actual = await vi.importActual<typeof import('./useTasks')>('./useTasks')
  return {
    ...actual,
    useCreateTaskMutation: () => ({ mutateAsync: createMock, isPending: createPending }),
    useUpdateTaskMutation: () => ({ mutateAsync: updateMock, isPending: updatePending }),
    useDeleteTaskMutation: () => ({ mutateAsync: deleteMock, isPending: false }),
  }
})

const memberId = 'member-1'

const fullTask: TaskResponse = {
  id: 't1',
  memberId,
  title: 'Rasen mähen',
  status: 'pending',
  notes: 'Vorderer Garten zuerst',
  dueDate: '2026-08-20',
  priority: 'high',
  completedAt: null,
}

const bareTask: TaskResponse = {
  id: 't2',
  memberId,
  title: 'Müll rausbringen',
  status: 'pending',
  notes: null,
  dueDate: null,
  priority: null,
  completedAt: null,
}

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({})
  updateMock.mockReset().mockResolvedValue({})
  deleteMock.mockReset().mockResolvedValue({})
  createPending = false
  updatePending = false
})

describe('TaskDialog (create)', () => {
  it('shows the create title and default priority', () => {
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={vi.fn()} />)
    expect(screen.getByText('Neue Aufgabe')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mittel' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides the delete button when creating', () => {
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('creates a task with the entered values', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Einkaufen gehen')
    await userEvent.type(screen.getByPlaceholderText('Zusätzliche Details…'), 'Milch, Brot')
    await userEvent.click(screen.getByRole('button', { name: 'Niedrig' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const arg = createMock.mock.calls[0][0].data
    expect(arg).toEqual({
      memberId,
      title: 'Einkaufen gehen',
      notes: 'Milch, Brot',
      dueDate: null,
      priority: 'low',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a task without a due date when the field stays empty', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Einkaufen gehen')
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const arg = createMock.mock.calls[0][0].data
    expect(arg.dueDate).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit an empty title', async () => {
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hinzufügen' })).toBeDisabled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('calls onClose when cancel is pressed', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('shows the saving label while the mutation is pending', async () => {
    createPending = true
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Einkaufen gehen')
    expect(screen.getByRole('button', { name: 'Speichern…' })).toBeDisabled()
  })

  it('shows an error message when saving fails', async () => {
    createMock.mockRejectedValueOnce(new Error('Netzwerkfehler'))
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={null} memberId={memberId} onClose={onClose} />)
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Einkaufen gehen')
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))
    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('TaskDialog (edit)', () => {
  it('shows the edit title and prefills every field', () => {
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={vi.fn()} />)
    expect(screen.getByText('Aufgabe bearbeiten')).toBeInTheDocument()
    expect(screen.getByLabelText('Aufgabe')).toHaveValue('Rasen mähen')
    expect(screen.getByLabelText('Fällig am')).toHaveValue('2026-08-20')
    expect(screen.getByRole('button', { name: 'Hoch' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Notizen (optional)')).toHaveValue('Vorderer Garten zuerst')
  })

  it('shows the delete button when editing', () => {
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  it('updates a task when editing', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    await userEvent.clear(screen.getByLabelText('Aufgabe'))
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Rasen mähen (Vorgarten)')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    expect(updateMock.mock.calls[0][0].id).toBe('t1')
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.title).toBe('Rasen mähen (Vorgarten)')
    expect(arg.notes).toBe('Vorderer Garten zuerst')
    expect(arg.dueDate).toBe('2026-08-20')
    expect(arg.priority).toBe('high')
    expect(arg.clearFields).toBeUndefined()
    expect(onClose).toHaveBeenCalled()
  })

  it('updates a task that never had optional fields without adding clearFields', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={bareTask} memberId={memberId} onClose={onClose} />)
    await userEvent.clear(screen.getByLabelText('Aufgabe'))
    await userEvent.type(screen.getByLabelText('Aufgabe'), 'Müll rausbringen (Mittwoch)')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.notes).toBeUndefined()
    expect(arg.dueDate).toBeUndefined()
    // priority defaults to 'medium' in the dialog even for a task that never had one —
    // that default (not the clearing fix) is what sends a real value here.
    expect(arg.priority).toBe('medium')
    expect(arg.clearFields).toBeUndefined()
    expect(onClose).toHaveBeenCalled()
  })

  it('clears notes when the field is emptied while editing', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    await userEvent.clear(screen.getByLabelText('Notizen (optional)'))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.notes).toBeUndefined()
    expect(arg.clearFields).toEqual(['notes'])
    expect(onClose).toHaveBeenCalled()
  })

  it('clears the due date when the field is emptied while editing', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    const dueDateInput = screen.getByLabelText('Fällig am')
    await userEvent.clear(dueDateInput)
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.dueDate).toBeUndefined()
    expect(arg.clearFields).toEqual(['dueDate'])
    expect(onClose).toHaveBeenCalled()
  })

  it('clears priority when the active priority button is pressed again while editing', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hoch' }))
    expect(screen.getByRole('button', { name: 'Hoch' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.priority).toBeUndefined()
    expect(arg.clearFields).toEqual(['priority'])
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes a task', async () => {
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 't1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error message when deleting fails', async () => {
    deleteMock.mockRejectedValueOnce(new Error('Löschfehler'))
    const onClose = vi.fn()
    renderWithProviders(<TaskDialog task={fullTask} memberId={memberId} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
