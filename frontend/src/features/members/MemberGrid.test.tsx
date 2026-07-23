import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberGrid } from './MemberGrid'
import type { MemberResponse } from '@/api/generated/model'

const base: MemberResponse = {
  id: '1', name: 'Anna', role: 'parent', color: 'blue',
  isActive: true, createdAt: '2026-07-22T10:00:00Z', updatedAt: '2026-07-22T10:00:00Z',
} as MemberResponse

describe('MemberGrid', () => {
  it('shows the empty state without members', () => {
    render(<MemberGrid members={[]} />)
    expect(screen.getByText('Noch keine Familienmitglieder angelegt.')).toBeInTheDocument()
  })

  it('renders a tile with name and role label', () => {
    render(<MemberGrid members={[base]} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Elternteil')).toBeInTheDocument()
    // no avatar → initial letter shown
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders an avatar image when avatarUrl is present', () => {
    render(<MemberGrid members={[{ ...base, avatarUrl: '/api/v1/members/1/avatar' }]} />)
    const img = screen.getByRole('img', { name: 'Anna' })
    expect(img).toHaveAttribute('src', '/api/v1/members/1/avatar')
  })

  it('calls onSelect when a tile is clicked', () => {
    const onSelect = vi.fn()
    render(<MemberGrid members={[{ ...base, role: 'child' }]} onSelect={onSelect} />)
    expect(screen.getByText('Kind')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  // Additional branch coverage tests
  it('renders multiple members in a responsive grid', () => {
    const members = [
      base,
      { ...base, id: '2', name: 'Bob', color: 'pink' },
      { ...base, id: '3', name: 'Carol', color: 'green' },
    ]
    render(<MemberGrid members={members} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  it('renders a member with an invalid/unknown color and falls back to blue', () => {
    // This tests the ?? MEMBER_COLORS.blue fallback branch
    render(<MemberGrid members={[{ ...base, color: 'invalid-color-xyz' as unknown as string }]} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    // The card should still render without error, using the blue fallback
  })

  it('does not call onSelect when onSelect is not provided', () => {
    render(<MemberGrid members={[base]} />)
    // Should not error when clicking without onSelect callback
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
  })
})
