import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskFilterBar } from './TaskFilterBar'

const counts = { all: 5, open: 3, done: 2 }

describe('TaskFilterBar', () => {
  it('renders all three filters with their counts', () => {
    render(<TaskFilterBar filter="all" counts={counts} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Alle 5' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offen 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erledigt 2' })).toBeInTheDocument()
  })

  it('marks the active filter with aria-pressed', () => {
    render(<TaskFilterBar filter="open" counts={counts} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Alle 5' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Offen 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Erledigt 2' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange for each filter', () => {
    const onChange = vi.fn()
    render(<TaskFilterBar filter="all" counts={counts} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alle 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Offen 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erledigt 2' }))
    expect(onChange).toHaveBeenNthCalledWith(1, 'all')
    expect(onChange).toHaveBeenNthCalledWith(2, 'open')
    expect(onChange).toHaveBeenNthCalledWith(3, 'done')
  })
})
