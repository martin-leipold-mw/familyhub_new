import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))

// Stub the dialog so this test focuses on the derivation, not the OAuth flow.
vi.mock('@/features/google/ReconnectDialog', () => ({
  ReconnectDialog: ({
    name,
    email,
    onClose,
  }: {
    name: string
    email: string
    onClose: () => void
  }) => (
    <div data-testid="reconnect-dialog">
      <span>{name}</span>
      <span>{email}</span>
      <button type="button" onClick={onClose}>
        close-dialog
      </button>
    </div>
  ),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from './RevokedConnectionSnackbars'

const active = {
  connectionId: 'conn-1',
  memberId: 'mem-1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: '2024-01-15T10:00:00Z',
  scopes: ['calendar'],
}

const revoked = {
  connectionId: 'conn-2',
  memberId: 'mem-2',
  email: 'papa@gmail.com',
  name: 'Papa',
  status: 'REVOKED',
  lastSyncedAt: null,
  scopes: [],
}

const REVOKED_TEXT = 'Papa (papa@gmail.com): Google-Verbindung abgelaufen. Bitte neu verbinden.'

function mockConnections(connections: unknown[]) {
  vi.mocked(useGoogleConnections).mockReturnValue({
    connections,
    isLoading: false,
    isError: false,
  } as never)
}

function renderShell() {
  return render(
    <SnackbarProvider>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RevokedConnectionSnackbars', () => {
  it('shows one snackbar for a revoked account and none for active accounts', () => {
    mockConnections([active, revoked])
    renderShell()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('clicking "Neu verbinden" opens the reconnect dialog with the account details', () => {
    mockConnections([revoked])
    renderShell()
    expect(screen.queryByTestId('reconnect-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    const dialog = screen.getByTestId('reconnect-dialog')
    expect(dialog).toHaveTextContent('Papa')
    expect(dialog).toHaveTextContent('papa@gmail.com')
  })

  it('closing the dialog removes it but keeps the snackbar', () => {
    mockConnections([revoked])
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Neu verbinden' }))
    fireEvent.click(screen.getByRole('button', { name: 'close-dialog' }))
    expect(screen.queryByTestId('reconnect-dialog')).not.toBeInTheDocument()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()
  })

  it('removes the snackbar when the account becomes active again', () => {
    mockConnections([revoked])
    const { rerender } = renderShell()
    expect(screen.getByText(REVOKED_TEXT)).toBeInTheDocument()

    // Same connectionId, now active — simulates a successful reconnect.
    mockConnections([{ ...revoked, status: 'ACTIVE' }])
    rerender(
      <SnackbarProvider>
        <RevokedConnectionSnackbars />
      </SnackbarProvider>,
    )
    expect(screen.queryByText(REVOKED_TEXT)).not.toBeInTheDocument()
  })
})
