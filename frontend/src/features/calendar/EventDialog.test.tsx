import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
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

  it('requires a member once a title is present', async () => {
    renderWithProviders(<EventDialog members={members} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Bitte wähle ein Mitglied.')).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects an end time that is not after the start time', async () => {
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={vi.fn()} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '07:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(
      await screen.findByText('Die Endzeit muss nach der Startzeit liegen.'),
    ).toBeInTheDocument()
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

  it('creates an all-day event when Ganztägig is toggled', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={onClose} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Urlaub')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    await userEvent.click(screen.getByLabelText('Ganztägig'))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(createMock).toHaveBeenCalledOnce())
    const arg = createMock.mock.calls[0][0].data
    expect(arg.isAllDay).toBe(true)
    expect(arg.allDayStart).toBeTruthy()
    expect(arg.allDayEnd).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the error message and keeps the dialog open when create fails', async () => {
    createMock.mockRejectedValueOnce(new Error('Netzwerkfehler'))
    const onClose = vi.fn()
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={onClose} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Netzwerkfehler')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a generic error when create fails with a non-Error rejection', async () => {
    createMock.mockRejectedValueOnce('boom')
    const onClose = vi.fn()
    renderWithProviders(
      <EventDialog members={members} defaultDate={new Date(2026, 6, 21, 8, 0)} onClose={onClose} />,
    )
    await userEvent.type(screen.getByLabelText('Titel'), 'Zahnarzt')
    await userEvent.click(screen.getByRole('button', { name: 'Anna' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without saving when Abbrechen is clicked', async () => {
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
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

  const existingAllDay = {
    id: 'e2',
    title: 'Urlaub',
    memberId: 'm1',
    isAllDay: true,
    start: null,
    end: null,
    allDayStart: '2026-07-21',
    allDayEnd: '2026-07-23',
    location: 'Zuhause',
    description: 'Ferien',
  }

  it('prefills date, Ganztägig, location and description for an existing all-day event', () => {
    renderWithProviders(<EventDialog members={members} initial={existingAllDay} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Ganztägig')).toBeChecked()
    expect(screen.getByLabelText('Datum')).toHaveValue('2026-07-21')
    expect(screen.getByLabelText('Ort (optional)')).toHaveValue('Zuhause')
    expect(screen.getByLabelText('Beschreibung (optional)')).toHaveValue('Ferien')
  })

  it('deletes after confirmation', async () => {
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ id: 'e1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error and keeps the dialog open when delete fails', async () => {
    deleteMock.mockRejectedValueOnce(new Error('Löschfehler'))
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    expect(await screen.findByText('Löschfehler')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a generic error when delete fails with a non-Error rejection', async () => {
    deleteMock.mockRejectedValueOnce('boom')
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wirklich löschen' }))
    expect(await screen.findByText('Löschen fehlgeschlagen.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('updates the existing event on save', async () => {
    const onClose = vi.fn()
    renderWithProviders(<EventDialog members={members} initial={existing} onClose={onClose} />)
    await userEvent.clear(screen.getByLabelText('Titel'))
    await userEvent.type(screen.getByLabelText('Titel'), 'Schule (neu)')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    expect(updateMock.mock.calls[0][0].id).toBe('e1')
    expect(updateMock.mock.calls[0][0].data.title).toBe('Schule (neu)')
    expect(onClose).toHaveBeenCalled()
  })

  it('preserves the original allDayEnd when editing a multi-day all-day event without changing the date', async () => {
    const onClose = vi.fn()
    const multiDay = {
      id: 'e9',
      title: 'Urlaub',
      memberId: 'm1',
      isAllDay: true,
      start: null,
      end: null,
      allDayStart: '2026-07-21',
      allDayEnd: '2026-07-23',
      location: null,
      description: null,
    }
    renderWithProviders(<EventDialog members={members} initial={multiDay} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.allDayEnd).toBe('2026-07-23')
    expect(onClose).toHaveBeenCalled()
  })

  it('drops allDayEnd when the edited date is moved past the original end', async () => {
    const onClose = vi.fn()
    const multiDay = {
      id: 'e9',
      title: 'Urlaub',
      memberId: 'm1',
      isAllDay: true,
      start: null,
      end: null,
      allDayStart: '2026-07-21',
      allDayEnd: '2026-07-23',
      location: null,
      description: null,
    }
    renderWithProviders(<EventDialog members={members} initial={multiDay} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-07-25' } })
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    const arg = updateMock.mock.calls[0][0].data
    expect(arg.allDayEnd).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })
})
