import { vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/features/google/useGoogleCredentials', () => ({
  useCreateCredentialsMutation: vi.fn(),
  useValidateCredentialsMutation: vi.fn(),
}))

import { useCreateCredentialsMutation, useValidateCredentialsMutation } from '@/features/google/useGoogleCredentials'
import { CredentialsStep } from './CredentialsStep'

function setupMocks({
  validateResult = { data: { isValid: true, message: 'OK' } } as unknown,
  createResult = {} as unknown,
  validateReject = null as unknown,
  createReject = null as unknown,
} = {}) {
  vi.mocked(useValidateCredentialsMutation).mockReturnValue({
    mutateAsync: validateReject
      ? vi.fn().mockRejectedValue(validateReject)
      : vi.fn().mockResolvedValue(validateResult),
  } as never)
  vi.mocked(useCreateCredentialsMutation).mockReturnValue({
    mutateAsync: createReject
      ? vi.fn().mockRejectedValue(createReject)
      : vi.fn().mockResolvedValue(createResult),
  } as never)
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'Familie' } })
  fireEvent.change(screen.getByLabelText('Client-ID'), { target: { value: 'client-id-123' } })
  fireEvent.change(screen.getByLabelText('Client-Secret'), { target: { value: 'secret-abc' } })
  // Redirect-URI is already prefilled
}

describe('CredentialsStep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('"Speichern & weiter" is disabled when fields are empty', () => {
    setupMocks()
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Speichern & weiter' })).toBeDisabled()
  })

  it('"Verbindung testen" is disabled when fields are empty', () => {
    setupMocks()
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Verbindung testen' })).toBeDisabled()
  })

  it('redirect URI is prefilled with window.location.origin + /oauth/callback', () => {
    setupMocks()
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    const input = screen.getByLabelText('Redirect-URI') as HTMLInputElement
    expect(input.value).toBe(window.location.origin + '/oauth/callback')
  })

  it('redirect URI is editable', () => {
    setupMocks()
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    const input = screen.getByLabelText('Redirect-URI') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/oauth/callback' } })
    expect(input.value).toBe('https://example.com/oauth/callback')
  })

  it('"Verbindung testen" shows green success message when isValid=true', async () => {
    setupMocks({ validateResult: { data: { isValid: true, message: 'Verbindung OK' } } })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Verbindung OK')).toBeInTheDocument())
    expect(screen.getByText('Verbindung OK')).toHaveClass('text-green-400')
  })

  it('"Verbindung testen" shows red error message when isValid=false', async () => {
    setupMocks({ validateResult: { data: { isValid: false, message: 'Ungültige Anmeldedaten' } } })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Ungültige Anmeldedaten')).toBeInTheDocument())
    expect(screen.getByText('Ungültige Anmeldedaten')).toHaveClass('text-red-400')
  })

  it('falls back to "Verbindung erfolgreich." when isValid=true and message is null', async () => {
    setupMocks({ validateResult: { data: { isValid: true, message: null } } })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Verbindung erfolgreich.')).toBeInTheDocument())
    expect(screen.getByText('Verbindung erfolgreich.')).toHaveClass('text-green-400')
  })

  it('falls back to "Verbindung fehlgeschlagen." when isValid=false and message is null', async () => {
    setupMocks({ validateResult: { data: { isValid: false, message: null } } })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Verbindung fehlgeschlagen.')).toBeInTheDocument())
    expect(screen.getByText('Verbindung fehlgeschlagen.')).toHaveClass('text-red-400')
  })

  it('"Verbindung testen" shows err.message (red) when validation rejects with an Error', async () => {
    setupMocks({ validateReject: new Error('Netzwerkfehler') })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument())
    expect(screen.getByText('Netzwerkfehler')).toHaveClass('text-red-400')
  })

  it('"Verbindung testen" shows fallback message when validation rejects with a non-Error', async () => {
    setupMocks({ validateReject: 'oops' })
    renderWithProviders(<CredentialsStep onNext={vi.fn()} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    await waitFor(() => expect(screen.getByText('Validierung fehlgeschlagen.')).toBeInTheDocument())
  })

  it('"Speichern & weiter" calls createMutation and calls onNext on success', async () => {
    setupMocks()
    const onNext = vi.fn()
    renderWithProviders(<CredentialsStep onNext={onNext} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & weiter' }))
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1))
    expect(vi.mocked(useCreateCredentialsMutation)().mutateAsync).toHaveBeenCalled()
  })

  it('"Speichern & weiter" shows error message when createMutation rejects', async () => {
    setupMocks({ createReject: new Error('Speichern fehlgeschlagen') })
    const onNext = vi.fn()
    renderWithProviders(<CredentialsStep onNext={onNext} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & weiter' }))
    await waitFor(() => expect(screen.getByText('Speichern fehlgeschlagen')).toBeInTheDocument())
    expect(onNext).not.toHaveBeenCalled()
  })

  it('"Speichern & weiter" shows fallback error when createMutation rejects with a non-Error', async () => {
    setupMocks({ createReject: 'oops' })
    const onNext = vi.fn()
    renderWithProviders(<CredentialsStep onNext={onNext} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Speichern & weiter' }))
    await waitFor(() =>
      expect(screen.getByText('Anmeldedaten konnten nicht gespeichert werden.')).toBeInTheDocument(),
    )
    expect(onNext).not.toHaveBeenCalled()
  })
})
