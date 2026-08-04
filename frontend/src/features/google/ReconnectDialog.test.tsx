import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { ReconnectDialog } from './ReconnectDialog'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth?state=x'

describe('ReconnectDialog', () => {
  const mutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStartGoogleAuth).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    mutateAsync.mockResolvedValue(AUTH_URL)
    Object.defineProperty(window, 'location', {
      value: { href: '', pathname: '/kalender' },
      writable: true,
    })
  })

  it('shows the affected account name and email', () => {
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Verbindung abgelaufen' })).toBeInTheDocument()
    expect(screen.getByText('Papa')).toBeInTheDocument()
    expect(screen.getByText('papa@gmail.com')).toBeInTheDocument()
  })

  it('"Bei Google anmelden" authorizes with the current path and redirects', async () => {
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bei Google anmelden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(mutateAsync).toHaveBeenCalledWith({ returnUrl: '/kalender' })
  })

  it('"Abbrechen" closes the dialog without starting auth', () => {
    const onClose = vi.fn()
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('disables the sign-in button while the auth request is pending', () => {
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync, isPending: true } as never)
    render(<ReconnectDialog name="Papa" email="papa@gmail.com" onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Bei Google anmelden' })).toBeDisabled()
  })
})
