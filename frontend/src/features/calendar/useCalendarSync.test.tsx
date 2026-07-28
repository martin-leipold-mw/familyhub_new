import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

const syncCalendars = vi.fn()
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  syncCalendars: (params: { memberId: string }) => syncCalendars(params),
  getListEventsQueryKey: () => ['/api/v1/events'],
}))

const connectionsRef = { current: [] as Array<{ memberId: string; status: string }> }
vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: () => ({
    connections: connectionsRef.current,
    isLoading: false,
    isError: false,
  }),
}))

import { useCalendarSync } from './useCalendarSync'

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  syncCalendars.mockReset().mockResolvedValue({ status: 200, data: {} })
})

describe('useCalendarSync', () => {
  it('syncs each distinct connected member once', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm2', status: 'connected' },
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm3', status: 'revoked' },
    ]
    const { result } = renderHook(() => useCalendarSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncCalendars).toHaveBeenCalledTimes(2)
    expect(syncCalendars).toHaveBeenCalledWith({ memberId: 'm1' })
    expect(syncCalendars).toHaveBeenCalledWith({ memberId: 'm2' })
  })

  it('sets isError when a sync call fails', async () => {
    connectionsRef.current = [{ memberId: 'm1', status: 'connected' }]
    syncCalendars.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCalendarSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
