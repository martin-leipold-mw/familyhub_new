import { vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

// ── Mock the generated network function ───────────────────────────────────────
// The component exchanges the single-use OAuth code by calling googleCallback()
// directly (module-level de-dup makes it StrictMode-safe), so we mock that
// function rather than the React Query hook.

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  googleCallback: vi.fn(),
}))

import { googleCallback } from '@/api/generated/endpoints/familyHubAPI'

// ── Mock react-router-dom navigate ───────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import { OAuthCallback } from './OAuthCallback'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUCCESS_DATA = {
  memberId: 'm1',
  memberName: 'Papa',
  isNewMember: true,
  returnUrl: '/setup',
}

function mockSuccess(data: Record<string, unknown> = SUCCESS_DATA) {
  vi.mocked(googleCallback).mockResolvedValue({
    data,
    status: 200,
    headers: new Headers(),
  } as never)
}

// Each test uses a unique code so the module-level exchange cache stays isolated.
let codeSeq = 0
function uniqueRoute(extra = '') {
  codeSeq += 1
  return `/oauth/callback?code=code${codeSeq}&state=xyz${extra}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OAuthCallback', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    vi.mocked(googleCallback).mockReset()
  })

  // ── Error param branch ─────────────────────────────────────────────────────

  describe('error param present', () => {
    it('shows the cancellation message', () => {
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(screen.getByText('Google-Authentifizierung wurde abgebrochen.')).toBeInTheDocument()
    })

    it('does NOT call the network', () => {
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(googleCallback).not.toHaveBeenCalled()
    })

    it('renders a Zurück link back to /', () => {
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(screen.getByRole('link', { name: 'Zurück' })).toBeInTheDocument()
    })
  })

  // ── Success branch ─────────────────────────────────────────────────────────

  describe('success branch', () => {
    it('shows Erfolgreich verbunden! and Willkommen, Papa! on success', async () => {
      mockSuccess()
      renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      await act(async () => {})
      expect(screen.getByText('Erfolgreich verbunden!')).toBeInTheDocument()
      expect(screen.getByText('Willkommen, Papa!')).toBeInTheDocument()
    })

    it('navigates to returnUrl after 1500ms', async () => {
      vi.useFakeTimers()
      try {
        mockSuccess()
        renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
        await act(async () => {})
        expect(mockNavigate).not.toHaveBeenCalled()
        act(() => {
          vi.advanceTimersByTime(1500)
        })
        expect(mockNavigate).toHaveBeenCalledWith('/setup')
      } finally {
        vi.useRealTimers()
      }
    })

    it('falls back to / when returnUrl is empty', async () => {
      vi.useFakeTimers()
      try {
        mockSuccess({ ...SUCCESS_DATA, returnUrl: '' })
        renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
        await act(async () => {})
        act(() => {
          vi.advanceTimersByTime(1500)
        })
        expect(mockNavigate).toHaveBeenCalledWith('/')
      } finally {
        vi.useRealTimers()
      }
    })

    it('calls the network with code and state from query params', () => {
      mockSuccess()
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(googleCallback).toHaveBeenCalledWith({ code: 'abc', state: 'xyz' })
    })

    it('shows plain Willkommen! when data has no memberName (empty-name fallback)', async () => {
      mockSuccess({ ...SUCCESS_DATA, memberName: undefined })
      renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      await act(async () => {})
      expect(screen.getByText('Erfolgreich verbunden!')).toBeInTheDocument()
      // memberName falls back to '' → greeting has no name/comma
      expect(screen.getByText('Willkommen!')).toBeInTheDocument()
    })
  })

  // ── Pending / loading branch ───────────────────────────────────────────────

  describe('pending branch', () => {
    it('shows Verbinde mit Google… while the exchange is in flight', () => {
      // A promise that never resolves keeps the component in its pending state.
      vi.mocked(googleCallback).mockReturnValue(new Promise(() => {}) as never)
      renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      expect(screen.getByText('Verbinde mit Google…')).toBeInTheDocument()
    })
  })

  // ── Error branch ───────────────────────────────────────────────────────────

  describe('exchange error branch', () => {
    it('shows Verbindung fehlgeschlagen. when the exchange rejects', async () => {
      vi.mocked(googleCallback).mockRejectedValue(new Error('boom'))
      renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      await act(async () => {})
      expect(screen.getByText('Verbindung fehlgeschlagen.')).toBeInTheDocument()
    })

    it('renders a Zurück link on error', async () => {
      vi.mocked(googleCallback).mockRejectedValue(new Error('boom'))
      renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      await act(async () => {})
      expect(screen.getByRole('link', { name: 'Zurück' })).toBeInTheDocument()
    })

    it('ignores a rejection that arrives after unmount', async () => {
      let reject: (reason?: unknown) => void = () => {}
      vi.mocked(googleCallback).mockReturnValue(
        new Promise((_resolve, r) => {
          reject = r
        }) as never,
      )
      const { unmount } = renderWithProviders(<OAuthCallback />, { route: uniqueRoute() })
      unmount()
      // Rejecting after unmount must not attempt a state update (active === false).
      await act(async () => {
        reject(new Error('boom'))
      })
    })
  })
})
