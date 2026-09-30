import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'

const mutateComplete = vi.fn()
const mutateUndo = vi.fn()

vi.mock('./useChoreAssignments', async () => {
  const actual = await vi.importActual<typeof import('./useChoreAssignments')>('./useChoreAssignments')
  return {
    ...actual,
    useChoreAssignments: vi.fn(),
    useCompleteAssignmentMutation: () => ({ mutate: mutateComplete }),
    useUndoAssignmentMutation: () => ({ mutate: mutateUndo }),
  }
})

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useChoreAssignments } from './useChoreAssignments'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoresView } from './ChoresView'
import {
  getListChoreAssignmentsQueryKey,
  getListMembersQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import { SnackbarProvider } from '@/routing/SnackbarProvider'

function renderView() {
  return renderWithProviders(
    <SnackbarProvider>
      <ChoresView />
    </SnackbarProvider>,
  )
}

const anna: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function assignment(overrides: Partial<ChoreAssignmentResponse> = {}): ChoreAssignmentResponse {
  return {
    id: 'a1',
    choreId: 'c1',
    memberId: 'm1',
    name: 'Toilette putzen',
    icon: '🚽',
    status: 'open',
    points: 10,
    assignedOn: '2026-09-22',
    ...overrides,
  }
}

function mockState({
  assignments = [] as ChoreAssignmentResponse[],
  members = [anna],
  isLoading = false,
  isError = false,
  membersLoading = false,
  membersError = false,
} = {}) {
  vi.mocked(useChoreAssignments).mockReturnValue({ assignments, isLoading, isError })
  vi.mocked(useMembers).mockReturnValue({ members, isLoading: membersLoading, isError: membersError })
}

describe('ChoresView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('zeigt die Kopfzeile', () => {
    mockState()
    renderView()

    expect(screen.getByRole('heading', { name: 'Haushalt' })).toBeInTheDocument()
  })

  it('zeigt einen Ladezustand', () => {
    mockState({ isLoading: true })
    renderView()

    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('zeigt einen Fehlerzustand', () => {
    mockState({ isError: true })
    renderView()

    expect(screen.getByText('Fehler beim Laden der Haushaltsaufgaben.')).toBeInTheDocument()
  })

  it('zeigt den Ladezustand statt des Leerhinweises, solange die Mitglieder laden', () => {
    mockState({ members: [], membersLoading: true })
    renderView()

    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
    expect(screen.queryByText('Noch keine Familienmitglieder angelegt.')).not.toBeInTheDocument()
  })

  it('zeigt den Fehlerzustand, wenn die Mitglieder nicht laden', () => {
    mockState({ members: [], membersError: true })
    renderView()

    expect(screen.getByText('Fehler beim Laden der Haushaltsaufgaben.')).toBeInTheDocument()
    expect(screen.queryByText('Noch keine Familienmitglieder angelegt.')).not.toBeInTheDocument()
  })

  it('laedt beim erneuten Versuch Aufgaben und Mitglieder neu', async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    mockState({ members: [], membersError: true })
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: getListChoreAssignmentsQueryKey() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: getListMembersQueryKey() })
    invalidate.mockRestore()
  })

  it('weist auf fehlende Mitglieder hin', () => {
    mockState({ members: [] })
    renderView()

    expect(screen.getByText('Noch keine Familienmitglieder angelegt.')).toBeInTheDocument()
  })

  it('zeigt je Mitglied eine Spalte mit seinen Aufgaben', () => {
    mockState({ assignments: [assignment()] })
    renderView()

    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
  })

  it('hakt eine Aufgabe ab', async () => {
    mockState({ assignments: [assignment()] })
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(mutateComplete).toHaveBeenCalledWith({ id: 'a1' }, expect.anything())
  })

  it('meldet ein fehlgeschlagenes Abhaken ueber eine Snackbar', async () => {
    mutateComplete.mockImplementation((_vars, handlers) => handlers.onError())
    mockState({ assignments: [assignment()] })
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen erledigt' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Abhaken fehlgeschlagen. Bitte noch einmal versuchen.',
    )
  })

  it('nimmt eine Erledigung zurueck', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:01:00Z'))
    mockState({
      assignments: [assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })],
    })
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(mutateUndo).toHaveBeenCalledWith({ id: 'a1' }, expect.anything())
    vi.useRealTimers()
  })

  it('meldet ein fehlgeschlagenes Zuruecknehmen', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:01:00Z'))
    mutateUndo.mockImplementation((_vars, handlers) => handlers.onError())
    mockState({
      assignments: [assignment({ status: 'completed', completedAt: '2026-09-22T09:00:00Z' })],
    })
    renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rückgängig fehlgeschlagen. Die 5-Minuten-Frist ist vermutlich abgelaufen.',
    )
    vi.useRealTimers()
  })
})
