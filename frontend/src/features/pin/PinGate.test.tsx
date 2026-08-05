import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

let hasPinSession = false
const setSession = vi.fn()
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession, sessionToken: null, clearSession: vi.fn() }),
}))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useVerifyPin: vi.fn() }))

import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinGate } from './PinGate'

function renderGate() {
  return render(
    <MemoryRouter>
      <PinGate><div>SECRET</div></PinGate>
    </MemoryRouter>,
  )
}

describe('PinGate', () => {
  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }),
    } as never)
  })

  it('renders the keypad and hides children when locked', () => {
    renderGate()
    expect(screen.getByRole('dialog', { name: 'PIN eingeben' })).toBeInTheDocument()
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
  })

  it('renders children when a session exists', () => {
    hasPinSession = true
    renderGate()
    expect(screen.getByText('SECRET')).toBeInTheDocument()
  })

  it('verifies the PIN and sets the session', async () => {
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(setSession).toHaveBeenCalledWith('tok'))
  })

  it('navigates to the calendar via the cancel control', () => {
    renderGate()
    fireEvent.click(screen.getByRole('button', { name: '← Zum Kalender' }))
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('shows the server error when verification fails with an Error', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Falsche PIN')),
    } as never)
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN')).toBeInTheDocument())
  })

  it('shows a fallback error when verification fails with a non-Error', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue('boom'),
    } as never)
    renderGate()
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN.')).toBeInTheDocument())
  })
})
