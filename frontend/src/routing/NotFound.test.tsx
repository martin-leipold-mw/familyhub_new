import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from './NotFound'

describe('NotFound', () => {
  it('renders a not-found message', () => {
    render(<NotFound />)
    expect(screen.getByText('Seite nicht gefunden')).toBeInTheDocument()
  })
})
