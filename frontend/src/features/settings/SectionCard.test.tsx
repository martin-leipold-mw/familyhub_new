import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { SectionCard } from './SectionCard'

describe('SectionCard', () => {
  it('renders a title and children', () => {
    render(<SectionCard title="Mitglieder"><p>Inhalt</p></SectionCard>)
    expect(screen.getByRole('heading', { name: 'Mitglieder' })).toBeInTheDocument()
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the + action and fires onClick', () => {
    const onClick = vi.fn()
    render(<SectionCard title="Google-Konten" action={{ label: 'Konto verbinden', onClick }} />)
    const btn = screen.getByRole('button', { name: 'Konto verbinden' })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
