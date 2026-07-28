import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })
})
