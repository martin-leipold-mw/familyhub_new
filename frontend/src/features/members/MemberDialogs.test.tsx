import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./useMembersQuery', () => ({
  useCreateMemberMutation: vi.fn(),
  useUpdateMemberMutation: vi.fn(),
  useDeleteMemberMutation: vi.fn(),
}))
vi.mock('./AvatarUpload', () => ({ AvatarUpload: () => <div>AvatarUpload</div> }))

import {
  useCreateMemberMutation,
  useUpdateMemberMutation,
  useDeleteMemberMutation,
} from './useMembersQuery'
import { AddMemberDialog } from './AddMemberDialog'
import { EditMemberDialog } from './EditMemberDialog'
import type { MemberResponse } from '@/api/generated/model'

const member: MemberResponse = {
  id: 'm1', name: 'Anna', role: 'parent', color: 'blue', isActive: true,
  createdAt: '2026-07-22T10:00:00Z', updatedAt: '2026-07-22T10:00:00Z',
} as MemberResponse

describe('member dialogs', () => {
  it('AddMemberDialog creates a member and closes', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<AddMemberDialog onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Neu' }) }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('AddMemberDialog creates a member with dateOfBirth (non-empty branch)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<AddMemberDialog onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kind' } })
    fireEvent.change(screen.getByLabelText('Geburtstag (optional)'), { target: { value: '2015-03-10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Kind', dateOfBirth: '2015-03-10' }),
      }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('AddMemberDialog creates a member without dateOfBirth (empty → undefined branch)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<AddMemberDialog onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Leer' } })
    // leave dateOfBirth empty
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Leer', dateOfBirth: undefined }),
      }),
    )
  })

  it('AddMemberDialog shows error message when mutateAsync rejects with an Error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Netzwerkfehler'))
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    render(<AddMemberDialog onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() => expect(screen.getByText('Netzwerkfehler')).toBeInTheDocument())
  })

  it('AddMemberDialog shows fallback error when mutateAsync rejects with non-Error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue('unbekannt')
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    render(<AddMemberDialog onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }))
    await waitFor(() => expect(screen.getByText('Speichern fehlgeschlagen.')).toBeInTheDocument())
  })

  it('EditMemberDialog updates a member', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const onClose = vi.fn()
    render(<EditMemberDialog member={member} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', data: expect.objectContaining({ name: 'Anna' }) }))
  })

  it('EditMemberDialog updates a member with dateOfBirth (non-empty branch)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const onClose = vi.fn()
    const memberWithDob: MemberResponse = { ...member, dateOfBirth: '2000-01-01' }
    render(<EditMemberDialog member={memberWithDob} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'm1',
        data: expect.objectContaining({ dateOfBirth: '2000-01-01' }),
      }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('EditMemberDialog shows error message when update mutateAsync rejects with Error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Update fehlgeschlagen'))
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    await waitFor(() => expect(screen.getByText('Update fehlgeschlagen')).toBeInTheDocument())
  })

  it('EditMemberDialog shows fallback error when update mutateAsync rejects with non-Error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(42)
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }))
    await waitFor(() => expect(screen.getByText('Speichern fehlgeschlagen.')).toBeInTheDocument())
  })

  it('EditMemberDialog deletes a member', async () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    const onClose = vi.fn()
    render(<EditMemberDialog member={member} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('EditMemberDialog shows error message when delete mutateAsync rejects with Error', async () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Löschen fehlgeschlagen'))
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(screen.getByText('Löschen fehlgeschlagen')).toBeInTheDocument())
  })

  it('EditMemberDialog shows fallback error when delete mutateAsync rejects with non-Error', async () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const mutateAsync = vi.fn().mockRejectedValue('bad')
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync, isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    await waitFor(() => expect(screen.getByText('Entfernen fehlgeschlagen.')).toBeInTheDocument())
  })

  it('EditMemberDialog renders the AvatarUpload component', () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    expect(screen.getByText('AvatarUpload')).toBeInTheDocument()
  })

  it('AddMemberDialog has correct dialog aria-label', () => {
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<AddMemberDialog onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Mitglied hinzufügen' })).toBeInTheDocument()
  })

  it('EditMemberDialog has correct dialog aria-label', () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    render(<EditMemberDialog member={member} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Mitglied bearbeiten' })).toBeInTheDocument()
  })

  it('AddMemberDialog calls onClose when Abbrechen is clicked', () => {
    vi.mocked(useCreateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const onClose = vi.fn()
    render(<AddMemberDialog onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('EditMemberDialog calls onClose when Abbrechen is clicked', () => {
    vi.mocked(useUpdateMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteMemberMutation).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const onClose = vi.fn()
    render(<EditMemberDialog member={member} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).toHaveBeenCalled()
  })
})
