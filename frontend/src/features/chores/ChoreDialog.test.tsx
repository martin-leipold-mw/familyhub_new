import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { ApiError } from '@/api/customFetch'
import type { ChoreResponse } from '@/api/generated/model'

const createAsync = vi.fn()
const updateAsync = vi.fn()
const deleteAsync = vi.fn()

vi.mock('./useChores', () => ({
  useCreateChoreMutation: () => ({ mutateAsync: createAsync, isPending: false }),
  useUpdateChoreMutation: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteChoreMutation: () => ({ mutateAsync: deleteAsync, isPending: false }),
}))

import { ChoreDialog } from './ChoreDialog'

const bestehend: ChoreResponse = {
  id: 'c1',
  name: 'Toilette putzen',
  icon: '🚽',
  description: 'Auch den Spiegel!',
  intervalDays: 7,
  assignmentGroup: 'children',
  points: 15,
  isActive: true,
  nextDueOn: '2026-09-29',
}

describe('ChoreDialog — Anlegen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('oeffnet mit dem Titel Neue Aufgabe', () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Neue Aufgabe' })).toBeInTheDocument()
  })

  it('legt eine Vorlage mit den Voreinstellungen an', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={null} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Müll rausbringen')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).toHaveBeenCalledWith({
      data: {
        name: 'Müll rausbringen',
        icon: '🧹',
        description: null,
        intervalDays: 7,
        assignmentGroup: 'all',
        points: 10,
      },
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('uebernimmt Emoji, Intervall, Gruppe und Punkte aus der Auswahl', async () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Bad putzen')
    await userEvent.click(screen.getByRole('button', { name: 'Symbol 🚽' }))
    await userEvent.click(screen.getByRole('button', { name: 'Täglich' }))
    await userEvent.click(screen.getByRole('button', { name: 'Kinder' }))
    const slider = screen.getByLabelText('Punkte')
    // Schieberegler: Wert direkt setzen, Tastatureingabe wäre 45 Pfeiltasten.
    fireEvent.change(slider, { target: { value: '25' } })

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ icon: '🚽', intervalDays: 1, assignmentGroup: 'children', points: 25 }),
      }),
    )
  })

  it('speichert nicht ohne Namen', async () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(createAsync).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte einen Namen eingeben.')).toBeInTheDocument()
  })

  it('meldet einen fehlgeschlagenen Speichervorgang', async () => {
    createAsync.mockRejectedValueOnce(new Error('kaputt'))
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Name'), 'Müll')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText('Speichern fehlgeschlagen.')).toBeInTheDocument()
  })

  it('schliesst beim Abbrechen ohne zu speichern', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={null} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(createAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('bietet beim Anlegen kein Loeschen an', () => {
    renderWithProviders(<ChoreDialog chore={null} onClose={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })
})

describe('ChoreDialog — Bearbeiten', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fuellt das Formular mit der Vorlage', () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Toilette putzen')
    expect(screen.getByLabelText('Beschreibung')).toHaveValue('Auch den Spiegel!')
    expect(screen.getByRole('button', { name: 'Kinder' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Wöchentlich' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('speichert die Aenderung', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Bad putzen')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', data: expect.objectContaining({ name: 'Bad putzen' }) }),
    )
  })

  it('leert eine entfernte Beschreibung ueber clearFields', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.clear(screen.getByLabelText('Beschreibung'))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clearFields: ['description'] }) }),
    )
  })

  it('schickt ohne vorherige Beschreibung kein clearFields', async () => {
    renderWithProviders(<ChoreDialog chore={{ ...bestehend, description: null }} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ clearFields: expect.anything() }) }),
    )
  })

  it('schaltet Aktiv um', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Aktiv' }))
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(updateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    )
  })

  it('loescht erst nach Bestaetigung', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(deleteAsync).not.toHaveBeenCalled()
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))

    expect(deleteAsync).toHaveBeenCalledWith({ id: 'c1' })
    expect(onClose).toHaveBeenCalled()
  })

  it('zeigt bei 400 (erledigte Historie) den Pausier-Hinweis', async () => {
    deleteAsync.mockRejectedValueOnce(new ApiError('Diese Aufgabe wurde bereits erledigt und kann nicht gelöscht werden. Bitte pausieren.', 400))
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))

    expect(
      await screen.findByText('Löschen nicht möglich — die Aufgabe wurde bereits erledigt. Bitte pausieren.'),
    ).toBeInTheDocument()
  })

  it('meldet ein sonstiges Loeschversagen ohne Pausier-Hinweis', async () => {
    deleteAsync.mockRejectedValueOnce(new ApiError('boom', 500))
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }))

    expect(await screen.findByText('Löschen fehlgeschlagen. Bitte erneut versuchen.')).toBeInTheDocument()
    expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument()
  })

  it('nimmt die Loeschabsicht zurueck', async () => {
    renderWithProviders(<ChoreDialog chore={bestehend} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nein, behalten' }))

    expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument()
    expect(deleteAsync).not.toHaveBeenCalled()
  })
})
