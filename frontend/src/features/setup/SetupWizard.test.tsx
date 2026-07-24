import { vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useGetSetupStatus: vi.fn(),
  useUpdateSetupStep: vi.fn(),
  useSetPin: vi.fn(),
}))
vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/members/AddMemberDialog', () => ({ AddMemberDialog: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close-add</button> }))
vi.mock('@/features/setup/redirectHome', () => ({ redirectHome: vi.fn() }))

vi.mock('@/features/google/useGoogleCredentials', () => ({
  useCreateCredentialsMutation: vi.fn(),
  useValidateCredentialsMutation: vi.fn(),
}))
vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))
vi.mock('@/features/google/useCalendars', () => ({
  useCalendarsForMember: vi.fn(),
  useSaveSelectedCalendarsMutation: vi.fn(),
  useStartGoogleAuth: vi.fn(),
}))

vi.mock('./GoogleGuideStep', () => ({ GoogleGuideStep: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>google-guide-next</button> }))
vi.mock('./CredentialsStep', () => ({ CredentialsStep: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>credentials-next</button> }))
vi.mock('./ConnectStep', () => ({ ConnectStep: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>connect-next</button> }))
vi.mock('./CalendarSelectStep', () => ({ CalendarSelectStep: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>calendar-next</button> }))

import { useGetSetupStatus, useUpdateSetupStep, useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { useMembers } from '@/features/members/useMembersQuery'
import { redirectHome } from '@/features/setup/redirectHome'
import { SetupWizard } from './SetupWizard'

function setup({ step = 1, members = [] as unknown[] } = {}) {
  vi.mocked(useGetSetupStatus).mockReturnValue({
    data: { data: { currentStep: step } }, isLoading: false, isError: false,
  } as never)
  vi.mocked(useUpdateSetupStep).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
  vi.mocked(useSetPin).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }) } as never)
  vi.mocked(useMembers).mockReturnValue({ members, isLoading: false, isError: false } as never)
}

describe('SetupWizard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts at the welcome step', () => {
    setup({ step: 1 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Willkommen bei FamilyHub')).toBeInTheDocument()
    expect(screen.getByText('Schritt 1 von 7')).toBeInTheDocument()
  })

  it('resumes at the stored step', () => {
    setup({ step: 2, members: [] })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 2 von 7')).toBeInTheDocument()
    // Weiter disabled without members
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeDisabled()
  })

  it('enables Weiter on the members step when a member exists', () => {
    setup({ step: 2, members: [{ id: '1', name: 'Anna' }] })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeEnabled()
  })

  it('resumes at step 3 (GoogleGuide)', () => {
    setup({ step: 3 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 3 von 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'google-guide-next' })).toBeInTheDocument()
  })

  it('completes setup on the PIN step (step 7) and redirects home', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    // enter matching PINs
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(redirectHome).toHaveBeenCalled())
  })

  // --- Additional branch coverage tests ---

  it('resume useEffect: falsy currentStep does not change step from default', () => {
    // currentStep undefined → falsy branch: step stays at 1
    vi.mocked(useGetSetupStatus).mockReturnValue({
      data: { data: { currentStep: undefined } }, isLoading: false, isError: false,
    } as never)
    vi.mocked(useUpdateSetupStep).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
    vi.mocked(useSetPin).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }) } as never)
    vi.mocked(useMembers).mockReturnValue({ members: [], isLoading: false, isError: false } as never)
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 1 von 7')).toBeInTheDocument()
    expect(screen.getByText('Willkommen bei FamilyHub')).toBeInTheDocument()
  })

  it('pressDigit: Löschen clears the entry', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    // type '1' then clear
    fireEvent.click(screen.getAllByRole('button', { name: '1' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    // After clear, "Weiter zur Bestätigung" should still be disabled (entry='')
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeDisabled()
  })

  it('pressDigit: ← backspaces the last character', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    // type '1','2','3','4' then backspace
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    // valid now — Weiter zur Bestätigung is enabled
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '←' }))
    // after backspace entry is '123' (length 3) → button disabled
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeDisabled()
  })

  it('pressDigit: does not append when entry is 6 digits (cap)', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    // enter 6 digits
    for (const d of '123456') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    // try to add a 7th
    fireEvent.click(screen.getAllByRole('button', { name: '1' })[0])
    // still valid (6 digits), button is enabled
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeEnabled()
  })

  it('confirmSecond: mismatch shows error and resets to PIN vergeben phase', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    // first PIN: 1234
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    // second PIN: 5678 (mismatch)
    for (const d of '5678') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(screen.getByText('Die PINs stimmen nicht überein.')).toBeInTheDocument())
    // Should be back on first phase
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeInTheDocument()
  })

  it('setPin.mutateAsync rejects with an Error → shows err.message', async () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      data: { data: { currentStep: 7 } }, isLoading: false, isError: false,
    } as never)
    vi.mocked(useUpdateSetupStep).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
    vi.mocked(useSetPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Serverfehler')),
    } as never)
    vi.mocked(useMembers).mockReturnValue({ members: [], isLoading: false, isError: false } as never)
    renderWithProviders(<SetupWizard />)
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(screen.getByText('Serverfehler')).toBeInTheDocument())
  })

  it('setPin.mutateAsync rejects with a non-Error → shows fallback message', async () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      data: { data: { currentStep: 7 } }, isLoading: false, isError: false,
    } as never)
    vi.mocked(useUpdateSetupStep).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) } as never)
    vi.mocked(useSetPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue('oops'),
    } as never)
    vi.mocked(useMembers).mockReturnValue({ members: [], isLoading: false, isError: false } as never)
    renderWithProviders(<SetupWizard />)
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    await waitFor(() => expect(screen.getByText('PIN konnte nicht gesetzt werden.')).toBeInTheDocument())
  })

  it('firstPin === null branch: shows "Weiter zur Bestätigung" label on step 7', () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeInTheDocument()
  })

  it('firstPin !== null branch: shows "Fertig" label after advancing to confirm phase', async () => {
    setup({ step: 7 })
    renderWithProviders(<SetupWizard />)
    for (const d of '1234') fireEvent.click(screen.getAllByRole('button', { name: d })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Weiter zur Bestätigung' }))
    expect(screen.getByRole('button', { name: 'Fertig' })).toBeInTheDocument()
  })

  it('goToStep: advances from step 1 to step 2 when clicking Los geht\'s', async () => {
    setup({ step: 1 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 1 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: "Los geht's →" }))
    await waitFor(() => expect(screen.getByText('Schritt 2 von 7')).toBeInTheDocument())
  })

  it('goToStep: advances from step 2 to step 3 (GoogleGuide) when clicking Weiter → (with member)', async () => {
    setup({ step: 2, members: [{ id: '1', name: 'Anna' }] })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 2 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter →' }))
    await waitFor(() => expect(screen.getByText('Schritt 3 von 7')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'google-guide-next' })).toBeInTheDocument()
  })

  it('goToStep: advances from step 3 (GoogleGuide) to step 4 (Credentials)', async () => {
    setup({ step: 3 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 3 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'google-guide-next' }))
    await waitFor(() => expect(screen.getByText('Schritt 4 von 7')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'credentials-next' })).toBeInTheDocument()
  })

  it('goToStep: advances from step 4 (Credentials) to step 5 (Connect)', async () => {
    setup({ step: 4 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 4 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'credentials-next' }))
    await waitFor(() => expect(screen.getByText('Schritt 5 von 7')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'connect-next' })).toBeInTheDocument()
  })

  it('goToStep: advances from step 5 (Connect) to step 6 (CalendarSelect)', async () => {
    setup({ step: 5 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 5 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'connect-next' }))
    await waitFor(() => expect(screen.getByText('Schritt 6 von 7')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'calendar-next' })).toBeInTheDocument()
  })

  it('goToStep: advances from step 6 (CalendarSelect) to step 7 (PIN)', async () => {
    setup({ step: 6 })
    renderWithProviders(<SetupWizard />)
    expect(screen.getByText('Schritt 6 von 7')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'calendar-next' }))
    await waitFor(() => expect(screen.getByText('Schritt 7 von 7')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Weiter zur Bestätigung' })).toBeInTheDocument()
  })

  it('MembersStep: Mitglied hinzufügen opens AddMemberDialog, close-add closes it', async () => {
    setup({ step: 2, members: [] })
    renderWithProviders(<SetupWizard />)
    // Dialog not visible initially
    expect(screen.queryByRole('button', { name: 'close-add' })).not.toBeInTheDocument()
    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByRole('button', { name: 'close-add' })).toBeInTheDocument()
    // Close dialog
    fireEvent.click(screen.getByRole('button', { name: 'close-add' }))
    expect(screen.queryByRole('button', { name: 'close-add' })).not.toBeInTheDocument()
  })
})
