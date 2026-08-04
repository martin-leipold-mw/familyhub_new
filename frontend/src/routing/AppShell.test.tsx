import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Stub the snackbars component so the shell test needs no QueryClient.
vi.mock('@/features/google/RevokedConnectionSnackbars', () => ({
  RevokedConnectionSnackbars: () => <div data-testid="revoked-snackbars" />,
}))

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })

  it('mounts the revoked-connection snackbars', () => {
    render(
      <AppShell>
        <p>Inhalt</p>
      </AppShell>,
    )
    expect(screen.getByTestId('revoked-snackbars')).toBeInTheDocument()
  })
})
