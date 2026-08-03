import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { ConnectionRevokedBanner } from './ConnectionRevokedBanner'

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

const BANNER_TEXT = 'Google-Verbindung abgelaufen. Kalender wird nicht mehr aktualisiert.'

describe('ConnectionRevokedBanner', () => {
  const startAuthMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useStartGoogleAuth).mockReturnValue({
      mutateAsync: startAuthMutateAsync,
      isPending: false,
    } as never)
    startAuthMutateAsync.mockResolvedValue(AUTH_URL)

    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/kalender' },
      writable: true,
    })
  })

  it('renders nothing when all connections are active', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neu verbinden' })).not.toBeInTheDocument()
  })

  it('renders nothing when there are no connections', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.queryByText(BANNER_TEXT)).not.toBeInTheDocument()
  })

  it('renders the banner when at least one connection is revoked', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [activeConnection, revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).toBeInTheDocument()
  })

  it('reconnect button is enabled without any PIN session', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    expect(screen.getByRole('button', { name: 'Neu verbinden' })).not.toBeDisabled()
  })

  it('clicking "Neu verbinden" authorizes with the current path and redirects to authUrl', async () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [revokedConnection],
      isLoading: false,
      isError: false,
    })
    render(<ConnectionRevokedBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuthMutateAsync).toHaveBeenCalledWith({ returnUrl: '/kalender' })
  })
})
