import { vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/features/google/useCalendars', () => ({
  useStartGoogleAuth: vi.fn(),
}))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { ConnectStep } from './ConnectStep'

describe('ConnectStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
  })

  it('clicking "Mit Google verbinden" calls startAuth and sets window.location.href', async () => {
    const mutateAsync = vi.fn().mockResolvedValue('https://accounts.google.com/o/oauth2/auth?foo=bar')
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync } as never)

    renderWithProviders(<ConnectStep onNext={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ returnUrl: '/setup' }))
    await waitFor(() =>
      expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth?foo=bar'),
    )
  })

  it('renders explanatory text', () => {
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: vi.fn() } as never)
    renderWithProviders(<ConnectStep onNext={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Mit Google verbinden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mit Google verbinden' })).toBeInTheDocument()
  })
})
