import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import { getListTasksQueryKey } from '@/api/generated/endpoints/familyHubAPI'
import type { MemberResponse, TaskResponse, ConnectionResponse } from '@/api/generated/model'
import { TasksView } from './TasksView'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
vi.mock('./useTaskSync', () => ({ useTaskSync: vi.fn() }))
vi.mock('./useTasks', async () => {
  const actual = await vi.importActual<typeof import('./useTasks')>('./useTasks')
  return {
    ...actual,
    useTasks: vi.fn(),
    useUpdateTaskMutation: vi.fn(),
  }
})

import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useTaskSync } from './useTaskSync'
import { useTasks, useUpdateTaskMutation } from './useTasks'

const anna: MemberResponse = {
  id: 'mem-1',
  name: 'Anna',
  role: 'child',
  color: 'blue',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}
const boris: MemberResponse = {
  id: 'mem-2',
  name: 'Boris',
  role: 'child',
  color: 'green',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

const annaConnection: ConnectionResponse = {
  connectionId: 'conn-1',
  memberId: 'mem-1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: null,
  scopes: ['https://www.googleapis.com/auth/tasks'],
}

function task(overrides: Partial<TaskResponse> & { id: string; memberId: string }): TaskResponse {
  return {
    id: overrides.id,
    memberId: overrides.memberId,
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? 'pending',
    dueDate: overrides.dueDate,
    priority: overrides.priority,
    notes: overrides.notes,
    completedAt: overrides.completedAt,
  }
}

// Einkaufen (kein Prio, 12.08.) und Blumen gießen (hoch, 20.08.) für Anna: unter "Nach Fälligkeit"
// steht Einkaufen zuerst, unter "Nach Priorität" kehrt sich die Reihenfolge um — das trägt den
// Sortier-Wechsel-Test.
const einkaufen = task({ id: 't1', memberId: 'mem-1', title: 'Einkaufen', dueDate: '2026-08-12', priority: null })
const rasenMaehen = task({ id: 't2', memberId: 'mem-1', title: 'Rasen mähen', status: 'completed' })
const blumenGiessen = task({
  id: 't4',
  memberId: 'mem-1',
  title: 'Blumen gießen',
  dueDate: '2026-08-20',
  priority: 'high',
})
const hausaufgaben = task({ id: 't3', memberId: 'mem-2', title: 'Hausaufgaben', status: 'pending' })

const defaultTasks = [einkaufen, rasenMaehen, blumenGiessen, hausaufgaben]

const updateMock = vi.fn()
const syncMock = vi.fn()

function mockTasks(overrides: Partial<{ tasks: TaskResponse[]; isLoading: boolean; isError: boolean }> = {}) {
  vi.mocked(useTasks).mockReturnValue({
    tasks: overrides.tasks ?? defaultTasks,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
  })
}

function mockConnections(connections: ConnectionResponse[] = [annaConnection]) {
  vi.mocked(useGoogleConnections).mockReturnValue({ connections, isLoading: false, isError: false } as never)
}

function mockSync(overrides: Partial<{ isSyncing: boolean; isError: boolean }> = {}) {
  vi.mocked(useTaskSync).mockReturnValue({
    sync: syncMock,
    isSyncing: overrides.isSyncing ?? false,
    isError: overrides.isError ?? false,
  })
}

function renderView() {
  const client = createTestQueryClient()
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <TasksView />
    </QueryClientProvider>,
  )
  return { invalidateSpy }
}

beforeEach(() => {
  vi.mocked(useMembers).mockReturnValue({ members: [anna, boris], isLoading: false, isError: false } as never)
  mockConnections()
  mockSync()
  updateMock.mockReset().mockResolvedValue({})
  syncMock.mockReset()
  vi.mocked(useUpdateTaskMutation).mockReturnValue({ mutateAsync: updateMock, isPending: false } as never)
  mockTasks()
})

describe('TasksView', () => {
  it('shows the loading state', () => {
    mockTasks({ isLoading: true, tasks: [] })
    renderView()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows the error state with a retry button', () => {
    mockTasks({ isError: true, tasks: [] })
    renderView()
    expect(screen.getByText('Fehler beim Laden der Aufgaben.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  it('retries loading when the retry button is pressed', () => {
    mockTasks({ isError: true, tasks: [] })
    const { invalidateSpy } = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: getListTasksQueryKey() })
  })

  it('shows the hint when no google account is connected', () => {
    mockConnections([])
    renderView()
    expect(
      screen.getByText('Kein Google-Konto verbunden. Aufgaben werden aus Google Tasks synchronisiert.'),
    ).toBeInTheDocument()
  })

  it('renders one card per member with a connection', () => {
    renderView()
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('does not render a card for members without a connection', () => {
    renderView()
    expect(screen.queryByText('Boris')).not.toBeInTheDocument()
  })

  it('shows the overall summary', () => {
    renderView()
    // 1 von 4 erledigt: nur "Rasen mähen" ist completed.
    expect(screen.getByText('1 von 4 erledigt')).toBeInTheDocument()
  })

  it('defaults to the open filter', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Offen 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Einkaufen')).toBeInTheDocument()
    expect(screen.queryByText('Rasen mähen')).not.toBeInTheDocument()
  })

  it('switches the filter and updates the shown tasks', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Erledigt 1' }))
    expect(screen.getByText('Rasen mähen')).toBeInTheDocument()
    expect(screen.queryByText('Einkaufen')).not.toBeInTheDocument()
  })

  it('counts always refer to the full set, not the filtered subset', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Erledigt 1' }))
    expect(screen.getByRole('button', { name: 'Offen 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alle 4' })).toBeInTheDocument()
  })

  it('switches the sort mode', async () => {
    renderView()
    const listBefore = screen.getByText('Einkaufen').closest('li')!.parentElement!
    expect(within(listBefore).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Einkaufen'),
      expect.stringContaining('Blumen gießen'),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Nach Priorität' }))
    const listAfter = screen.getByText('Blumen gießen').closest('li')!.parentElement!
    expect(within(listAfter).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Blumen gießen'),
      expect.stringContaining('Einkaufen'),
    ])
  })

  it('opens the dialog for a new task and closes it again', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Aufgabe hinzufügen' }))
    expect(screen.getByRole('dialog', { name: 'Neue Aufgabe' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the dialog for an existing task', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Einkaufen bearbeiten' }))
    expect(screen.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeInTheDocument()
    expect(screen.getByLabelText('Aufgabe')).toHaveValue('Einkaufen')
  })

  it('toggles an open task to completed via the row checkbox', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Einkaufen' }))
    expect(updateMock).toHaveBeenCalledWith({ id: 't1', data: { status: 'completed' } })
  })

  it('toggles a completed task back to open via the row checkbox', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Erledigt 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Rasen mähen' }))
    expect(updateMock).toHaveBeenCalledWith({ id: 't2', data: { status: 'pending' } })
  })

  it('triggers a sync and shows the syncing state', async () => {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Synchronisieren' }))
    expect(syncMock).toHaveBeenCalled()

    mockSync({ isSyncing: true })
    renderView()
    expect(screen.getAllByRole('button', { name: 'Synchronisieren' })[1]).toBeDisabled()
  })

  it('shows an error when the sync fails', () => {
    mockSync({ isError: true })
    renderView()
    expect(screen.getByText('Synchronisierung fehlgeschlagen.')).toBeInTheDocument()
  })

  it('shows the scope notice when a connection lacks the tasks scope', () => {
    mockConnections([{ ...annaConnection, scopes: [] }])
    renderView()
    expect(
      screen.getByText('Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.'),
    ).toBeInTheDocument()
  })

  it('does not show the scope notice when every connection has it', () => {
    renderView()
    expect(
      screen.queryByText('Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.'),
    ).not.toBeInTheDocument()
  })
})
