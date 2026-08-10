import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

const syncTaskLists = vi.fn()
const getListTasksQueryKey = vi.fn(() => ['/api/v1/tasks'])
const getListConnectionsQueryKey = vi.fn(() => ['/api/v1/connections'])
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  syncTaskLists: (params: { memberId: string }) => syncTaskLists(params),
  getListTasksQueryKey: () => getListTasksQueryKey(),
  getListConnectionsQueryKey: () => getListConnectionsQueryKey(),
}))

const connectionsRef = { current: [] as Array<{ memberId: string; status: string }> }
vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: () => ({
    connections: connectionsRef.current,
    isLoading: false,
    isError: false,
  }),
}))

import { useTaskSync } from './useTaskSync'

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  syncTaskLists.mockReset().mockResolvedValue({ status: 200, data: {} })
  getListTasksQueryKey.mockReset().mockReturnValue(['/api/v1/tasks'])
  getListConnectionsQueryKey.mockReset().mockReturnValue(['/api/v1/connections'])
})

describe('useTaskSync', () => {
  it('syncs each connected member once', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm2', status: 'connected' },
    ]
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncTaskLists).toHaveBeenCalledTimes(2)
    expect(syncTaskLists).toHaveBeenCalledWith({ memberId: 'm1' })
    expect(syncTaskLists).toHaveBeenCalledWith({ memberId: 'm2' })
  })

  it('skips revoked connections', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'REVOKED' },
      { memberId: 'm2', status: 'connected' },
    ]
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncTaskLists).toHaveBeenCalledTimes(1)
    expect(syncTaskLists).toHaveBeenCalledWith({ memberId: 'm2' })
  })

  it('deduplicates members with several connections', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm1', status: 'connected' },
    ]
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncTaskLists).toHaveBeenCalledTimes(1)
    expect(syncTaskLists).toHaveBeenCalledWith({ memberId: 'm1' })
  })

  it('sets isError when one sync rejects', async () => {
    connectionsRef.current = [
      { memberId: 'm1', status: 'connected' },
      { memberId: 'm2', status: 'connected' },
    ]
    syncTaskLists.mockImplementation((p: { memberId: string }) =>
      p.memberId === 'm1' ? Promise.reject(new Error('boom')) : Promise.resolve({ status: 200, data: {} }),
    )
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    expect(syncTaskLists).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('sets isError when the whole call throws', async () => {
    connectionsRef.current = [{ memberId: 'm1', status: 'connected' }]
    getListTasksQueryKey.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    await act(async () => {
      await result.current.sync()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('resets isSyncing when finished', async () => {
    connectionsRef.current = [{ memberId: 'm1', status: 'connected' }]
    const { result } = renderHook(() => useTaskSync(), { wrapper })
    expect(result.current.isSyncing).toBe(false)
    await act(async () => {
      await result.current.sync()
    })
    expect(result.current.isSyncing).toBe(false)
  })
})
