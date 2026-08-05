import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
  useDisconnectConnectionMutation: vi.fn(),
}))
vi.mock('@/features/google/useCalendars', () => ({ useStartGoogleAuth: vi.fn() }))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { GoogleAccountsSettings } from './GoogleAccountsSettings'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'
// `member` has an avatarUrl so the active row exercises the <img> branch; the
// revoked row's memberId (mem-2) has no matching member, exercising the <span>
// initial-letter branch. Together they cover both sides of `member?.avatarUrl`.
const member = { id: 'mem-1', name: 'Anna', role: 'parent', color: 'blue', avatarUrl: 'http://x/a.png', isActive: true, createdAt: 'x', updatedAt: 'x' }
const active = { connectionId: 'conn-1', memberId: 'mem-1', email: 'anna@gmail.com', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
const revoked = { connectionId: 'conn-2', memberId: 'mem-2', email: 'bob@gmail.com', name: 'Bob', status: 'REVOKED', lastSyncedAt: null, scopes: [] }

describe('GoogleAccountsSettings', () => {
  const disconnect = vi.fn()
  const startAuth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useDisconnectConnectionMutation).mockReturnValue({ mutateAsync: disconnect } as never)
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: startAuth } as never)
    startAuth.mockResolvedValue(AUTH_URL)
    disconnect.mockResolvedValue(undefined)
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('shows loading', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: true, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows error', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: true } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Fehler beim Laden der Konten.')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Noch kein Google-Konto verbunden.')).toBeInTheDocument()
  })

  it('shows an active connection with Verbunden and a trash button', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [active], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbunden')).toHaveClass('text-accent')
    expect(screen.getByText('Anna (anna@gmail.com)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anna trennen' })).toBeInTheDocument()
  })

  it('shows a revoked connection with a reconnect button', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [revoked], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbindung abgelaufen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).toBeInTheDocument()
  })

  it('trash button triggers disconnect', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [active], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna trennen' }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith({ id: 'conn-1' }))
  })

  it('+ action starts the connect redirect', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Google-Konto verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/settings' })
  })

  it('reconnect redirects to the auth url', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [revoked], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
  })

  it('falls back to MEMBER_COLORS.blue when the linked member has an invalid color', () => {
    // mem-3's color isn't a key of MEMBER_COLORS, so MEMBER_COLORS[member.color] is
    // undefined and the `?? MEMBER_COLORS.blue` fallback on line 55 must run.
    const invalidColorMember = { id: 'mem-3', name: 'Chris', role: 'parent', color: 'rainbow', isActive: true, createdAt: 'x', updatedAt: 'x' }
    const activeInvalidColor = { connectionId: 'conn-3', memberId: 'mem-3', email: 'chris@gmail.com', name: 'Chris', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
    vi.mocked(useMembers).mockReturnValue({ members: [invalidColorMember], isLoading: false, isError: false } as never)
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [activeInvalidColor], isLoading: false, isError: false } as never)
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Chris (chris@gmail.com)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chris trennen' })).toBeInTheDocument()
  })
})
