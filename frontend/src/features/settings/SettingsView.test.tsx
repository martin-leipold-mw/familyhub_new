import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useVerifyPin: vi.fn() }))
vi.mock('@/features/members/AddMemberDialog', () => ({
  AddMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>
      AddDialog
      <button onClick={onClose}>CloseAdd</button>
    </div>
  ),
}))
vi.mock('@/features/members/EditMemberDialog', () => ({
  EditMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>
      EditDialog
      <button onClick={onClose}>CloseEdit</button>
    </div>
  ),
}))
vi.mock('@/features/settings/ChangePinDialog', () => ({
  ChangePinDialog: ({ onClose }: { onClose: () => void }) => (
    <div>
      ChangePinDialog
      <button onClick={onClose}>CloseChangePin</button>
    </div>
  ),
}))
vi.mock('@/features/google/GoogleAccountsSettings', () => ({
  GoogleAccountsSettings: () => <div>GoogleAccountsSettings</div>,
}))
vi.mock('@/features/google/CalendarManagement', () => ({
  CalendarManagement: () => <div>CalendarManagement</div>,
}))

const setSession = vi.fn()
let hasPinSession = false
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession, sessionToken: null, clearSession: vi.fn() }),
}))

import { useMembers } from '@/features/members/useMembersQuery'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { SettingsView } from './SettingsView'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

describe('SettingsView', () => {
  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useVerifyPin).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ data: { sessionToken: 'tok' } }) } as never)
  })

  it('shows a locked state and unlocks via PIN', async () => {
    render(<SettingsView />)
    expect(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' }))
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(setSession).toHaveBeenCalledWith('tok'))
  })

  it('shows management actions when unlocked', () => {
    hasPinSession = true
    render(<SettingsView />)
    expect(screen.getByRole('button', { name: 'Mitglied hinzufügen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PIN ändern' })).toBeInTheDocument()
  })

  it('opens the edit dialog when a member tile is tapped while unlocked', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })

  it('opens AddMemberDialog when Mitglied hinzufügen is clicked', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
  })

  it('opens ChangePinDialog when PIN ändern is clicked', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
  })

  it('closes the unlock dialog when Abbrechen is clicked', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows error when unlock fails with an Error instance', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Falsche PIN')),
    } as never)
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' }))
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN')).toBeInTheDocument())
  })

  it('shows fallback error when unlock fails with a non-Error value', async () => {
    vi.mocked(useVerifyPin).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue('bad'),
    } as never)
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Zum Bearbeiten entsperren' }))
    for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    await waitFor(() => expect(screen.getByText('Falsche PIN.')).toBeInTheDocument())
  })

  it('does not open edit dialog when a tile is tapped while locked', () => {
    hasPinSession = false
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })

  it('closes AddMemberDialog when its onClose is called', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseAdd' }))
    expect(screen.queryByText('AddDialog')).not.toBeInTheDocument()
  })

  it('closes EditMemberDialog when its onClose is called', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseEdit' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })

  it('closes ChangePinDialog when its onClose is called', () => {
    hasPinSession = true
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseChangePin' }))
    expect(screen.queryByText('ChangePinDialog')).not.toBeInTheDocument()
  })
})
