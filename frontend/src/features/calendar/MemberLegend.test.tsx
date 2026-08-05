import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberLegend } from './MemberLegend'
import type { MemberResponse } from '@/api/generated/model'

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'm2', name: 'Papa', role: 'parent', color: 'blue', isActive: true, createdAt: '', updatedAt: '' },
]

function expectedBackground(color: string): string {
  const probe = document.createElement('span')
  probe.style.backgroundColor = color
  return probe.style.backgroundColor
}

describe('MemberLegend', () => {
  it('renders a colored dot and name for each member', () => {
    const { container } = render(<MemberLegend members={members} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Papa')).toBeInTheDocument()

    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(2)
    expect((dots[0] as HTMLElement).style.backgroundColor).toBe(expectedBackground('hsl(340 75% 75%)'))
    expect((dots[1] as HTMLElement).style.backgroundColor).toBe(expectedBackground('hsl(210 80% 70%)'))
  })

  it('renders nothing when there are no members', () => {
    const { container } = render(<MemberLegend members={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
