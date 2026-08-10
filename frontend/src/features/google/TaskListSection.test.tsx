import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
vi.mock('@/features/tasks/useTaskLists', () => ({
  useAllTaskLists: vi.fn(),
  useTaskListsForMember: vi.fn(),
  useSaveSelectedTaskListsMutation: vi.fn(),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllTaskLists,
  useTaskListsForMember,
  useSaveSelectedTaskListsMutation,
} from '@/features/tasks/useTaskLists'
import { TaskListSection } from './TaskListSection'

const connection = { connectionId: 'c1', memberId: 'm1', email: 'a@x.de', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
const tl1 = { id: 'tl1', title: 'Erledigungen', isSelected: true, isWriteTarget: true, memberId: 'm1' }
const tl2 = { id: 'tl2', title: 'Einkauf', isSelected: true, isWriteTarget: false, memberId: 'm1' }
const tl4 = { id: 'tl4', title: 'Projekt', isSelected: false, isWriteTarget: false, memberId: 'm1' }

const save = vi.fn()

function expand() {
  fireEvent.click(screen.getByRole('button', { expanded: false }))
}

describe('TaskListSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAllTaskLists).mockReturnValue({
      taskLists: [tl1, tl2, { ...tl1, id: 'tl3', isSelected: false }],
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useTaskListsForMember).mockReturnValue({ taskLists: [tl1, tl2], isLoading: false, isError: false } as never)
    vi.mocked(useSaveSelectedTaskListsMutation).mockReturnValue({ mutateAsync: save } as never)
    save.mockResolvedValue(undefined)
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection], isLoading: false, isError: false } as never)
  })

  // ── section-level branches ──
  it('shows the loading state', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: true, isError: false } as never)
    render(<TaskListSection />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows the error state', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: true } as never)
    render(<TaskListSection />)
    expect(screen.getByText('Fehler beim Laden der Aufgabenlisten.')).toBeInTheDocument()
  })

  it('shows the hint when no account is connected', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<TaskListSection />)
    expand()
    expect(screen.getByText('Keine Google-Konten verbunden.')).toBeInTheDocument()
  })

  it('renders the selected count in the header', () => {
    render(<TaskListSection />)
    expect(screen.getByText('Aufgabenlisten · 2 ausgewählt')).toBeInTheDocument()
  })

  it('is collapsed by default and expands on click', () => {
    render(<TaskListSection />)
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
    expect(screen.queryByText('Anna – Aufgabenlisten')).not.toBeInTheDocument()
    expand()
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
    expect(screen.getByText('Anna – Aufgabenlisten')).toBeInTheDocument()
  })

  // ── inner ConnectionTaskLists branches ──
  it('lists every task list of a connection', () => {
    render(<TaskListSection />)
    expand()
    expect(screen.getByText('Anna – Aufgabenlisten')).toBeInTheDocument()
    expect(screen.getByText('Erledigungen')).toBeInTheDocument()
    expect(screen.getByText('Einkauf')).toBeInTheDocument()
  })

  it('shows the loading state for a connection while its lists load', () => {
    vi.mocked(useTaskListsForMember).mockReturnValue({ taskLists: [], isLoading: true, isError: false } as never)
    render(<TaskListSection />)
    expand()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows the empty state when a connection has no lists', () => {
    vi.mocked(useTaskListsForMember).mockReturnValue({ taskLists: [], isLoading: false, isError: false } as never)
    render(<TaskListSection />)
    expand()
    expect(screen.getByText('Keine Aufgabenlisten gefunden.')).toBeInTheDocument()
  })

  it('shows the error state when the lists of a connection fail to load', () => {
    vi.mocked(useTaskListsForMember).mockReturnValue({ taskLists: [], isLoading: false, isError: true } as never)
    render(<TaskListSection />)
    expand()
    expect(screen.getByText('Fehler beim Laden der Aufgabenlisten.')).toBeInTheDocument()
  })

  it('toggles a list selection', () => {
    render(<TaskListSection />)
    expand()
    const selectCheckbox = screen.getByRole('checkbox', { name: 'Einkauf' })
    expect(selectCheckbox).toBeChecked()
    fireEvent.click(selectCheckbox) // deselect (not the write target -> no clearing)
    expect(selectCheckbox).not.toBeChecked()
    fireEvent.click(selectCheckbox) // reselect (covers both handleToggle branches)
    expect(selectCheckbox).toBeChecked()
  })

  it('selects a write target', async () => {
    render(<TaskListSection />)
    expand()
    const targetRadios = screen.getAllByRole('radio', { name: 'Zielliste für neue Aufgaben' })
    fireEvent.click(targetRadios[1]) // make "Einkauf" the write target
    expect(targetRadios[1]).toBeChecked()

    // Deselecting the list that is now the write target must clear it (backend
    // rejects a writeTargetId that isn't among the selected list ids).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Einkauf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ data: { memberId: 'm1', taskListIds: ['tl1'], writeTargetId: null } }),
    )
  })

  it('selecting a write target on an unselected list also selects it', async () => {
    vi.mocked(useTaskListsForMember).mockReturnValue({ taskLists: [tl1, tl4], isLoading: false, isError: false } as never)
    render(<TaskListSection />)
    expand()
    const projectCheckbox = screen.getByRole('checkbox', { name: 'Projekt' })
    expect(projectCheckbox).not.toBeChecked()

    const targetRadios = screen.getAllByRole('radio', { name: 'Zielliste für neue Aufgaben' })
    fireEvent.click(targetRadios[1]) // "Projekt" isn't selected yet
    expect(projectCheckbox).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: { memberId: 'm1', taskListIds: ['tl1', 'tl4'], writeTargetId: 'tl4' },
      }),
    )
  })

  it('saves the selection', async () => {
    render(<TaskListSection />)
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        data: { memberId: 'm1', taskListIds: ['tl1', 'tl2'], writeTargetId: 'tl1' },
      }),
    )
  })
})
