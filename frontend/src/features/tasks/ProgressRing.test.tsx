import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressRing } from './ProgressRing'

describe('ProgressRing', () => {
  it('renders the percentage as text', () => {
    render(<ProgressRing percent={42} />)
    expect(screen.getByText('42 %')).toBeInTheDocument()
  })

  it('renders a full ring at 100 percent', () => {
    render(<ProgressRing percent={100} />)
    expect(screen.getByRole('img', { name: '100 % erledigt' })).toBeInTheDocument()
    expect(screen.getByText('100 %')).toBeInTheDocument()
  })

  it('renders an empty ring at 0 percent', () => {
    render(<ProgressRing percent={0} />)
    expect(screen.getByRole('img', { name: '0 % erledigt' })).toBeInTheDocument()
    expect(screen.getByText('0 %')).toBeInTheDocument()
  })
})
