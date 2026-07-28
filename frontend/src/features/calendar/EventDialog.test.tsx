import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { EventDialog } from './EventDialog'
import type { MemberResponse } from '@/api/generated/model'

const createMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('./useCalendarEvents', async () => {
  const actual = await vi.importActual<typeof import('./useCalendarEvents')>('./useCalendarEvents')
  return {
    ...actual,
    useCreateEventMutation: () => ({ mutateAsync: createMock, isPending: false }),
    useUpdateEventMutation: () => ({ mutateAsync: updateMock, isPending: false }),
    useDeleteEventMutation: () => ({ mutateAsync: deleteMock, isPending: false }),
  }
})

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
]

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({})
  updateMock.mockReset().mockResolvedValue({})
  deleteMock.mockReset().mockResolvedValue({})
})

describe('EventDialog (create)', () => {
  it('requires title and member', async () => {
    renderWithProviders(<EventDialog members={members} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Bitte gib einen Titel ein.')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('creates a timed event with the selected member', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={onClose} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const arg = createMock.mock.calls[0][0].data
    expect(arg.memberId).toBe('m1')
    expect(arg.title).toBe('Zahnarzt')
    expect(arg.isAllDay).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('EventDialog (edit + delete)', () => {
  const existing = {
    id: 'e1',
    title: 'Schule',
    memberId: 'm1',
    isAllDay: false,
    start: new Date(2026, 6, 21, 9, 0),
    end: new Date(2026, 6, 21, 10, 0),
    allDayStart: null,
    allDayEnd: null,
    location: null,
    description: null,
  }

  it('deletes after confirmation', async () => {
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 'e1' }))
    expect(onClose).toHaveBeenCalled()
  })
})
