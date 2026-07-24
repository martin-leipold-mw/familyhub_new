import { vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

// ── Mock the generated hook ───────────────────────────────────────────────────

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useGoogleCallback: vi.fn(),
}))

import { useGoogleCallback } from '@/api/generated/endpoints/familyHubAPI'

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

const SUCCESS_RESPONSE = {
  data: {
    memberId: 'm1',
    memberName: 'Papa',
    isNewMember: true,
    returnUrl: '/setup',
  },
  status: 200 as const,
  headers: new Headers(),
}

function makeMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(SUCCESS_RESPONSE),
    isSuccess: false,
    isError: false,
    isPending: false,
    data: undefined,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OAuthCallback', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    vi.mocked(useGoogleCallback).mockReset()
  })

  // ── Error param branch ─────────────────────────────────────────────────────

  describe('error param present', () => {
    it('shows the cancellation message', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(makeMutation() as never)
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(screen.getByText('Google-Authentifizierung wurde abgebrochen.')).toBeInTheDocument()
    })

    it('does NOT call the mutation', () => {
      const mutate = vi.fn()
      vi.mocked(useGoogleCallback).mockReturnValue(makeMutation({ mutate }) as never)
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(mutate).not.toHaveBeenCalled()
    })

    it('renders a Zurück link back to /', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(makeMutation() as never)
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?error=access_denied' })
      expect(screen.getByRole('link', { name: 'Zurück' })).toBeInTheDocument()
    })
  })

  // ── Success branch ─────────────────────────────────────────────────────────

  describe('success branch', () => {
    it('shows Erfolgreich verbunden! and Willkommen, Papa! on success', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(
        makeMutation({
          isSuccess: true,
          data: SUCCESS_RESPONSE,
        }) as never,
      )
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(screen.getByText('Erfolgreich verbunden!')).toBeInTheDocument()
      expect(screen.getByText('Willkommen, Papa!')).toBeInTheDocument()
    })

    it('navigates to returnUrl after 1500ms', () => {
      vi.useFakeTimers()
      try {
        vi.mocked(useGoogleCallback).mockReturnValue(
          makeMutation({
            isSuccess: true,
            data: SUCCESS_RESPONSE,
          }) as never,
        )
        renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
        expect(mockNavigate).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(1500) })
        expect(mockNavigate).toHaveBeenCalledWith('/setup')
      } finally {
        vi.useRealTimers()
      }
    })

    it('falls back to / when returnUrl is empty', () => {
      vi.useFakeTimers()
      try {
        const emptyReturnUrl = {
          ...SUCCESS_RESPONSE,
          data: { ...SUCCESS_RESPONSE.data, returnUrl: '' },
        }
        vi.mocked(useGoogleCallback).mockReturnValue(
          makeMutation({
            isSuccess: true,
            data: emptyReturnUrl,
          }) as never,
        )
        renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
        act(() => { vi.advanceTimersByTime(1500) })
        expect(mockNavigate).toHaveBeenCalledWith('/')
      } finally {
        vi.useRealTimers()
      }
    })

    it('calls mutation with code and state from query params', () => {
      const mutate = vi.fn()
      vi.mocked(useGoogleCallback).mockReturnValue(makeMutation({ mutate }) as never)
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(mutate).toHaveBeenCalledWith({ data: { code: 'abc', state: 'xyz' } })
    })

    it('shows plain Willkommen! when data has no memberName (empty-name fallback)', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(
        makeMutation({
          isSuccess: true,
          data: undefined,
        }) as never,
      )
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(screen.getByText('Erfolgreich verbunden!')).toBeInTheDocument()
      // memberName falls back to '' → greeting has no name/comma
      expect(screen.getByText('Willkommen!')).toBeInTheDocument()
    })
  })

  // ── Pending / loading branch ───────────────────────────────────────────────

  describe('pending branch', () => {
    it('shows Verbinde mit Google… while mutation is pending', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(
        makeMutation({ isPending: true }) as never,
      )
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(screen.getByText('Verbinde mit Google…')).toBeInTheDocument()
    })
  })

  // ── Mutation error branch ──────────────────────────────────────────────────

  describe('mutation error branch', () => {
    it('shows Verbindung fehlgeschlagen. on mutation error', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(
        makeMutation({ isError: true }) as never,
      )
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(screen.getByText('Verbindung fehlgeschlagen.')).toBeInTheDocument()
    })

    it('renders a Zurück link on error', () => {
      vi.mocked(useGoogleCallback).mockReturnValue(
        makeMutation({ isError: true }) as never,
      )
      renderWithProviders(<OAuthCallback />, { route: '/oauth/callback?code=abc&state=xyz' })
      expect(screen.getByRole('link', { name: 'Zurück' })).toBeInTheDocument()
    })
  })
})
