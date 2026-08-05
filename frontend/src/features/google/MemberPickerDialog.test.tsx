import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { MemberPickerDialog } from './MemberPickerDialog'

// Anna has an avatar (covers the <img> branch), Ben does not (covers the
// initial-letter <span> branch); the two roles cover both roleLabel outputs.
const members = [
  { id: '1', name: 'Anna', role: 'parent', color: 'blue', avatarUrl: 'http://x/a.png', isActive: true, createdAt: 'x', updatedAt: 'x' },
  { id: '2', name: 'Ben', role: 'child', color: 'pink', isActive: true, createdAt: 'x', updatedAt: 'x' },
]

describe('MemberPickerDialog', () => {
  it('lists members and returns the chosen id', () => {
    const onSelect = vi.fn()
    render(<MemberPickerDialog members={members as never} onSelect={onSelect} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    expect(onSelect).toHaveBeenCalledWith('1')
  })

  it('cancels', () => {
    const onCancel = vi.fn()
    render(<MemberPickerDialog members={members as never} onSelect={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a hint when there are no members', () => {
    render(<MemberPickerDialog members={[]} onSelect={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Bitte zuerst ein Mitglied anlegen.')).toBeInTheDocument()
  })

  it('falls back to MEMBER_COLORS.blue when a member has an invalid color', () => {
    // 'rainbow' isn't a key of MEMBER_COLORS, so MEMBER_COLORS[m.color] is
    // undefined and the `?? MEMBER_COLORS.blue` fallback must run.
    const invalidColorMember = { id: '3', name: 'Chris', role: 'parent', color: 'rainbow', isActive: true, createdAt: 'x', updatedAt: 'x' }
    render(<MemberPickerDialog members={[invalidColorMember] as never} onSelect={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: /Chris/ })).toBeInTheDocument()
  })
})
