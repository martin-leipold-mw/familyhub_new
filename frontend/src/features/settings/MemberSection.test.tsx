import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/features/members/useMembersQuery', () => ({ useMembers: vi.fn() }))
vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
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

import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { MemberSection } from './MemberSection'

const member = { id: '1', name: 'Anna', role: 'parent', color: 'blue', isActive: true, createdAt: 'x', updatedAt: 'x' }
const connection = { connectionId: 'c1', memberId: '1', email: 'a@x.de', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }

describe('MemberSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMembers).mockReturnValue({ members: [member], isLoading: false, isError: false } as never)
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection], isLoading: false, isError: false } as never)
  })

  it('shows the linked badge for a member with a connection', () => {
    render(<MemberSection />)
    expect(screen.getByLabelText('Mit Google verknüpft')).toBeInTheDocument()
  })

  it('opens AddMemberDialog from the + action', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    expect(screen.getByText('AddDialog')).toBeInTheDocument()
  })

  it('opens EditMemberDialog when a tile is tapped', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByText('EditDialog')).toBeInTheDocument()
  })

  it('closes the add dialog again', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Mitglied hinzufügen' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseAdd' }))
    expect(screen.queryByText('AddDialog')).not.toBeInTheDocument()
  })

  it('closes the edit dialog again', () => {
    render(<MemberSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'CloseEdit' }))
    expect(screen.queryByText('EditDialog')).not.toBeInTheDocument()
  })
})
