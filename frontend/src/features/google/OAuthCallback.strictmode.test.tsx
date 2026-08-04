import { vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PinSessionProvider } from '@/features/pin/PinSessionContext'
import { OAuthCallback } from './OAuthCallback'

// Reproduction: real useGoogleCallback hook, real QueryClient, StrictMode double-mount,
// mocked fetch. Mirrors dev-server behaviour (main.tsx wraps the app in <StrictMode>).

describe('OAuthCallback under StrictMode (real mutation)', () => {
  it('exchanges the code once and reaches the success screen', async () => {
    let postCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      postCount += 1
      return new Response(
        JSON.stringify({
          memberId: 'm1',
          memberName: 'Papa',
          isNewMember: true,
          returnUrl: '/settings',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <PinSessionProvider>
            <MemoryRouter initialEntries={['/oauth/callback?code=abc&state=xyz']}>
              <OAuthCallback />
            </MemoryRouter>
          </PinSessionProvider>
        </QueryClientProvider>
      </StrictMode>,
    )

    // The single-use OAuth code must be exchanged exactly once (guard requirement).
    await waitFor(() => expect(postCount).toBe(1))

    // And the UI must reflect that success, not stay stuck on the pending screen.
    await waitFor(() =>
      expect(screen.getByText('Erfolgreich verbunden!')).toBeInTheDocument(),
    )
  })
})
