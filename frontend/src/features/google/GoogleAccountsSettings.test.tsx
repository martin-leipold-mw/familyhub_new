import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
  useDisconnectConnectionMutation: vi.fn(),
}))

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

let hasPinSession = false
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession: vi.fn(), sessionToken: null, clearSession: vi.fn() }),
}))

import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { GoogleAccountsSettings } from './GoogleAccountsSettings'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'

const activeConnection = {
  connectionId: 'conn-1',
  memberId: 'mem-1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: '2024-01-15T10:00:00Z',
  scopes: ['calendar'],
}

const revokedConnection = {
  connectionId: 'conn-2',
  memberId: 'mem-2',
  email: 'bob@gmail.com',
  name: 'Bob',
  status: 'REVOKED',
  lastSyncedAt: null,
  scopes: [],
}

describe('GoogleAccountsSettings', () => {
  const disconnectMutateAsync = vi.fn()
  const startAuthMutateAsync = vi.fn()

  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()

    vi.mocked(useDisconnectConnectionMutation).mockReturnValue({
      mutateAsync: disconnectMutateAsync,
    } as never)

    vi.mocked(useStartGoogleAuth).mockReturnValue({
      mutateAsync: startAuthMutateAsync,
    } as never)

    startAuthMutateAsync.mockResolvedValue(AUTH_URL)
    disconnectMutateAsync.mockResolvedValue(undefined)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
  })

  it('shows loading state when isLoading is true', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: true,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows error state when isError is true', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: true,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Fehler beim Laden der Konten.')).toBeInTheDocument()
  })

  it('shows empty state message when there are no connections', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Noch kein Google-Konto verbunden.')).toBeInTheDocument()
  })

  it('shows connect button disabled when no PIN session (empty state)', () => {
    hasPinSession = false
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    const btn = screen.getByRole('button', { name: 'Weiteres Konto verbinden' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows connect button enabled when hasPinSession (empty state)', () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    const btn = screen.getByRole('button', { name: 'Weiteres Konto verbinden' })
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveAttribute('aria-disabled', 'false')
  })

  it('shows "Verbunden" in green for active connection', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbunden')).toBeInTheDocument()
    expect(screen.getByText('Verbunden')).toHaveClass('text-green-400')
    expect(screen.getByText('Anna (anna@gmail.com)')).toBeInTheDocument()
  })

  it('shows lastSyncedAt when present on active connection', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText(`Zuletzt synchronisiert: ${activeConnection.lastSyncedAt}`)).toBeInTheDocument()
  })

  it('does not show sync date when lastSyncedAt is absent', () => {
    const connectionNoSync = { ...activeConnection, lastSyncedAt: null }
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connectionNoSync],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.queryByText(/Zuletzt synchronisiert/)).not.toBeInTheDocument()
  })

  it('shows revoked warning text and "Neu verbinden" button for revoked connection', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByText('Verbindung abgelaufen — bitte neu verbinden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).toBeInTheDocument()
  })

  it('disables buttons and shows hint when hasPinSession is false', () => {
    hasPinSession = false
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByRole('button', { name: 'Trennen' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Weiteres Konto verbinden' })).toBeDisabled()
    expect(screen.getByText('Melde dich mit PIN an, um Kalender zu verwalten.')).toBeInTheDocument()
  })

  it('enables buttons and hides hint when hasPinSession is true', () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    expect(screen.getByRole('button', { name: 'Trennen' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Weiteres Konto verbinden' })).not.toBeDisabled()
    expect(screen.queryByText('Melde dich mit PIN an, um Kalender zu verwalten.')).not.toBeInTheDocument()
  })

  it('calls disconnectMutation.mutateAsync with the connection id', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Trennen' }))
    await waitFor(() =>
      expect(disconnectMutateAsync).toHaveBeenCalledWith({ id: activeConnection.connectionId })
    )
  })

  it('clicking "Weiteres Konto verbinden" sets window.location.href to authUrl', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Weiteres Konto verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuthMutateAsync).toHaveBeenCalledWith({ returnUrl: '/' })
  })

  it('clicking "Neu verbinden" on revoked connection redirects to authUrl', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<GoogleAccountsSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuthMutateAsync).toHaveBeenCalledWith({ returnUrl: '/' })
  })
})
