import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

// Stub the snackbars component so the shell test needs no QueryClient.
vi.mock('@/features/google/RevokedConnectionSnackbars', () => ({
  RevokedConnectionSnackbars: () => <div data-testid="revoked-snackbars" />,
}))

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })

  it('mounts the revoked-connection snackbars', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByTestId('revoked-snackbars')).toBeInTheDocument()
  })

  it('renders links to calendar, tasks and settings', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByRole('link', { name: 'Kalender' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Aufgaben' })).toHaveAttribute('href', '/tasks')
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/settings')
  })

  it('marks the current section with aria-current', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
      { route: '/tasks' },
    )
    expect(screen.getByRole('link', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Kalender' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Einstellungen' })).not.toHaveAttribute('aria-current')
  })

  it('marks the calendar link as current on the root route', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByRole('link', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the settings link as current on the settings route', () => {
    renderWithProviders(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
      { route: '/settings' },
    )
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('aria-current', 'page')
  })
})
