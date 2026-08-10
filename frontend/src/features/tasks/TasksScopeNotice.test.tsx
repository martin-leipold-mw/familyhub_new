import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ConnectionResponse } from '@/api/generated/model'

vi.mock('@/features/google/useCalendars', () => ({ useStartGoogleAuth: vi.fn() }))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { TasksScopeNotice } from './TasksScopeNotice'

const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'

function connection(overrides: Partial<ConnectionResponse> & { connectionId: string }): ConnectionResponse {
  return {
    connectionId: overrides.connectionId,
    memberId: overrides.memberId ?? 'mem-1',
    email: overrides.email ?? 'anna@gmail.com',
    name: overrides.name ?? 'Anna',
    status: overrides.status ?? 'ACTIVE',
    lastSyncedAt: overrides.lastSyncedAt ?? null,
    scopes: overrides.scopes ?? [CALENDAR_SCOPE],
  }
}

describe('TasksScopeNotice', () => {
  const startAuth = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: startAuth } as never)
    startAuth.mockResolvedValue(AUTH_URL)
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('renders nothing when every connection has the scope', () => {
    const c = connection({ connectionId: 'conn-1', scopes: [TASKS_SCOPE] })
    const { container } = render(<TasksScopeNotice connections={[c]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names each affected account', () => {
    const anna = connection({ connectionId: 'conn-1', memberId: 'mem-1', name: 'Anna', scopes: [] })
    const boris = connection({ connectionId: 'conn-2', memberId: 'mem-2', name: 'Boris', scopes: [CALENDAR_SCOPE] })
    render(<TasksScopeNotice connections={[anna, boris]} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Boris')).toBeInTheDocument()
    expect(
      screen.getAllByText('Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.'),
    ).toHaveLength(2)
  })

  it('starts the OAuth flow for the affected member when reconnect is pressed', async () => {
    const c = connection({ connectionId: 'conn-1', memberId: 'mem-1', scopes: [] })
    render(<TasksScopeNotice connections={[c]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Konto neu verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/tasks', memberId: 'mem-1' })
  })
})
