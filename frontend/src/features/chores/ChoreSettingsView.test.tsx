import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import type { ChoreResponse, MemberResponse } from '@/api/generated/model'

const mutate = vi.fn()

vi.mock('./useChores', () => ({
  useChores: vi.fn(),
  useUpdateChoreMutation: () => ({ mutate }),
}))

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

// Das PinGate wird an anderer Stelle geprüft; hier steht die Seite selbst
// im Mittelpunkt.
vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./ChoreDialog', () => ({
  ChoreDialog: ({ chore }: { chore: ChoreResponse | null }) => (
    <div data-testid="chore-dialog">{chore ? chore.name : 'neu'}</div>
  ),
}))

import { useChores } from './useChores'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChoreSettingsView } from './ChoreSettingsView'

const anna: MemberResponse = {
  id: 'm1',
  name: 'Anna',
  role: 'child',
  color: 'pink',
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

function chore(overrides: Partial<ChoreResponse> = {}): ChoreResponse {
  return {
    id: 'c1',
    name: 'Toilette putzen',
    icon: '🚽',
    intervalDays: 7,
    assignmentGroup: 'all',
    points: 10,
    isActive: true,
    nextDueOn: '2026-09-29',
    ...overrides,
  }
}

function mockState({ chores = [] as ChoreResponse[], isLoading = false, isError = false } = {}) {
  vi.mocked(useChores).mockReturnValue({ chores, isLoading, isError })
  vi.mocked(useMembers).mockReturnValue({ members: [anna], isLoading: false, isError: false })
}

describe('ChoreSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('zeigt Kopfzeile und Rueckweg', () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByRole('heading', { name: 'Haushaltsaufgaben' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Zu den Einstellungen' })).toHaveAttribute('href', '/settings')
  })

  it('zeigt einen Ladezustand', () => {
    mockState({ isLoading: true })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('zeigt einen Fehlerzustand', () => {
    mockState({ isError: true })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Fehler beim Laden der Haushaltsaufgaben.')).toBeInTheDocument()
  })

  it('zeigt einen Leerzustand', () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Noch keine Haushaltsaufgaben angelegt.')).toBeInTheDocument()
  })

  it('listet die Vorlagen auf', () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    expect(screen.getByText('Toilette putzen')).toBeInTheDocument()
  })

  it('oeffnet den Dialog fuer eine neue Aufgabe', async () => {
    mockState()
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Neue Aufgabe' }))

    expect(screen.getByTestId('chore-dialog')).toHaveTextContent('neu')
  })

  it('oeffnet den Dialog zum Bearbeiten', async () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen bearbeiten' }))

    expect(screen.getByTestId('chore-dialog')).toHaveTextContent('Toilette putzen')
  })

  it('pausiert eine Vorlage', async () => {
    mockState({ chores: [chore()] })
    renderWithProviders(<ChoreSettingsView />)

    await userEvent.click(screen.getByRole('button', { name: 'Toilette putzen pausieren' }))

    expect(mutate).toHaveBeenCalledWith({ id: 'c1', data: { isActive: false } })
  })
})
