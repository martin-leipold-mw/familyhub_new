import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockMatchMedia(false) // start in light
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the "switch to dark" label in light mode and toggles to dark', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)
    const btn = screen.getByRole('button', { name: 'Zu dunklem Design wechseln' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: 'Zu hellem Design wechseln' })).toBeInTheDocument()
  })
})
