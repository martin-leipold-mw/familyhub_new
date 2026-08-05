import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/theme/ThemeToggle', () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
vi.mock('@/features/members/AddMemberDialog', () => ({
  AddMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>AddDialog<button onClick={onClose}>CloseAdd</button></div>
  ),
}))
vi.mock('@/features/members/EditMemberDialog', () => ({
  EditMemberDialog: ({ onClose }: { onClose: () => void }) => (
    <div>EditDialog<button onClick={onClose}>CloseEdit</button></div>
  ),
}))
vi.mock('@/features/settings/ChangePinDialog', () => ({
  ChangePinDialog: ({ onClose }: { onClose: () => void }) => (
    <div>ChangePinDialog<button onClick={onClose}>CloseChangePin</button></div>
  ),
}))
vi.mock('@/features/google/GoogleAccountsSettings', () => ({
  GoogleAccountsSettings: () => <div>GoogleAccountsSettings</div>,
}))
vi.mock('@/features/google/CalendarManagement', () => ({
  CalendarManagement: () => <div>CalendarManagement</div>,
}))

import { useMembers } from '@/features/members/useMembersQuery'
import { SettingsView } from './SettingsView'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }

function renderView() {
  return render(<MemoryRouter><SettingsView /></MemoryRouter>)
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
  })

  it('shows management actions (behind the gate)', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Mitglied hinzufügen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PIN ändern' })).toBeInTheDocument()
  })

  it('opens the edit dialog when a member tile is tapped', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })

  it('opens and closes AddMemberDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseAdd' }))
    expect(screen.queryByText('AddDialog')).not.toBeInTheDocument()
  })

  it('opens and closes EditMemberDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseEdit' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })

  it('opens and closes ChangePinDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseChangePin' }))
    expect(screen.queryByText('ChangePinDialog')).not.toBeInTheDocument()
  })
})
