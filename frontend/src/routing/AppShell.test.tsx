import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/features/google/ConnectionRevokedBanner', () => ({
  ConnectionRevokedBanner: () => <div data-testid="revoked-banner" />,
}))

import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders its children', () => {
    render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByText('Inhalt')).toBeInTheDocument()
  })

  it('renders the revoked-connection banner above the children', () => {
    const { container } = render(<AppShell><p>Inhalt</p></AppShell>)
    expect(screen.getByTestId('revoked-banner')).toBeInTheDocument()
    // The banner must be the first child of the shell, i.e. above the content.
    const root = container.firstChild as HTMLElement
    expect(root.firstElementChild).toHaveAttribute('data-testid', 'revoked-banner')
  })
})
