import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberSelect } from './MemberSelect'
import type { MemberResponse } from '@/api/generated/model'

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'm2', name: 'Papa', role: 'parent', color: 'green', isActive: true, createdAt: '', updatedAt: '' },
]

describe('MemberSelect', () => {
  it('outlines the selected member and not the others', () => {
    render(<MemberSelect members={members} value="m1" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveClass('ring-accent', 'ring-offset-surface')
    expect(screen.getByRole('button', { name: 'Papa' })).not.toHaveClass('ring-accent')
  })

  it('marks no member as outlined when nothing is selected', () => {
    render(<MemberSelect members={members} value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Anna' })).not.toHaveClass('ring-accent')
  })

  it('fires onChange with the clicked member id', async () => {
    const onChange = vi.fn()
    render(<MemberSelect members={members} value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Papa' }))
    expect(onChange).toHaveBeenCalledWith('m2')
  })
})
