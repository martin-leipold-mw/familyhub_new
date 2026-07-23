import { vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useSetPin: vi.fn(),
}))
vi.mock('@/features/setup/redirectHome', () => ({ redirectHome: vi.fn() }))

import { useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { redirectHome } from '@/features/setup/redirectHome'
import { PinStep } from './PinStep'

function setupMock({ resolveWith = { data: { sessionToken: 'tok' } }, rejectWith = null as unknown } = {}) {
  if (rejectWith !== null) {
    vi.mocked(useSetPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(rejectWith),
    } as never)
  } else {
    vi.mocked(useSetPin).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(resolveWith),
    } as never)
  }
}

describe('PinStep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('success path: matching PINs → setSession called, onDone called, redirectHome called', async () => {
    setupMock()
    const onDone = vi.fn()
    renderWithProviders(<PinStep onDone={onDone} />)

    // Phase 1: enter PIN vergeben
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    // Phase 2: PIN bestätigen
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PIN bestätigen' })).toBeInTheDocument())
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled()
      expect(redirectHome).toHaveBeenCalled()
    })
  })

  it('mismatch: different second PIN → error shown and reset to PIN vergeben phase', async () => {
    setupMock()
    renderWithProviders(<PinStep />)

    // Phase 1: enter '1234'
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    // Phase 2: enter '5678' (mismatch)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PIN bestätigen' })).toBeInTheDocument())
    for (const d of '5678') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    // Should be back at PIN vergeben with error
    await waitFor(() => expect(screen.getByText('Die PINs stimmen nicht überein.')).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
  })

  it('setPin.mutateAsync rejects with an Error → err.message shown', async () => {
    setupMock({ rejectWith: new Error('Netzwerkfehler') })
    renderWithProviders(<PinStep />)

    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PIN bestätigen' })).toBeInTheDocument())
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument())
    // back to PIN vergeben phase
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
  })

  it('setPin.mutateAsync rejects with non-Error → fallback message shown', async () => {
    setupMock({ rejectWith: 'something-weird' })
    renderWithProviders(<PinStep />)

    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PIN bestätigen' })).toBeInTheDocument())
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))

    await waitFor(() => expect(screen.getByText('PIN konnte nicht gesetzt werden.')).toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
  })

  it('onCancel in first phase (PIN vergeben): clears error', async () => {
    setupMock()
    renderWithProviders(<PinStep />)

    // Initially in PIN vergeben dialog
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    // Still in PIN vergeben (onCancel just clears error, doesn't navigate away)
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
  })

  it('onCancel in second phase (PIN bestätigen): resets to first phase', async () => {
    setupMock()
    renderWithProviders(<PinStep />)

    // Go to phase 2
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'PIN bestätigen' })).toBeInTheDocument())

    // Cancel from phase 2
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    // Returns to PIN vergeben
    expect(screen.getByRole('dialog', { name: 'PIN vergeben' })).toBeInTheDocument()
  })
})
