import { vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'
import { GoogleGuideStep } from './GoogleGuideStep'

describe('GoogleGuideStep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('"Weiter →" is disabled when no checkboxes are checked', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeDisabled()
  })

  it('"Weiter →" is disabled when only some checkboxes are checked', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // check only the first 3
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeDisabled()
  })

  it('"Weiter →" is enabled when all 4 checkboxes are checked', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    for (const cb of checkboxes) fireEvent.click(cb)
    expect(screen.getByRole('button', { name: 'Weiter →' })).toBeEnabled()
  })

  it('clicking "Weiter →" when all checked calls onNext', () => {
    const onNext = vi.fn()
    renderWithProviders(<GoogleGuideStep onNext={onNext} />)
    const checkboxes = screen.getAllByRole('checkbox')
    for (const cb of checkboxes) fireEvent.click(cb)
    fireEvent.click(screen.getByRole('button', { name: 'Weiter →' }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('shows the redirect URI with window.location.origin + /oauth/callback', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    const expectedUri = window.location.origin + '/oauth/callback'
    expect(screen.getByText(expectedUri)).toBeInTheDocument()
  })

  it('lists all required OAuth scopes', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    expect(screen.getByText('https://www.googleapis.com/auth/calendar')).toBeInTheDocument()
    expect(screen.getByText('https://www.googleapis.com/auth/userinfo.profile')).toBeInTheDocument()
    expect(screen.getByText('https://www.googleapis.com/auth/userinfo.email')).toBeInTheDocument()
  })

  it('there are exactly 4 checkboxes', () => {
    renderWithProviders(<GoogleGuideStep onNext={vi.fn()} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })
})
