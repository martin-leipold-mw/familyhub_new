import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useCalendars', () => ({ useStartGoogleAuth: vi.fn() }))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))

import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { ConnectStep } from './ConnectStep'

const AUTH_URL = 'https://accounts.google.com/auth'
const member = { id: 'm1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

describe('ConnectStep', () => {
  const startAuth = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useStartGoogleAuth).mockReturnValue({ mutateAsync: startAuth } as never)
    startAuth.mockResolvedValue(AUTH_URL)
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  it('with members, opens the picker and connects with the chosen memberId', async () => {
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    render(<ConnectStep onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/setup', memberId: 'm1' })
  })

  it('with no members, connects without a memberId (fallback)', async () => {
    vi.mocked(useMembers).mockReturnValue({ members: [], isLoading: false, isError: false } as never)
    render(<ConnectStep onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    await waitFor(() => expect(window.location.href).toBe(AUTH_URL))
    expect(startAuth).toHaveBeenCalledWith({ returnUrl: '/setup', memberId: undefined })
  })

  it('with members, cancelling the picker closes it without connecting', () => {
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    render(<ConnectStep onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog', { name: 'Mitglied auswählen' })).not.toBeInTheDocument()
    expect(startAuth).not.toHaveBeenCalled()
  })
})
