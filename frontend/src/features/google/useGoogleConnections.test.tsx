import { vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

// ── Mock generated hooks ──────────────────────────────────────────────────────

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  // connections
  useListConnections: vi.fn(),
  useDisconnectConnection: vi.fn(),
  useRefreshConnection: vi.fn(),
  getListConnectionsQueryKey: () => ['/api/v1/google/connections'],

  // credentials
  useListCredentials: vi.fn(),
  useCreateCredentials: vi.fn(),
  useValidateCredentials: vi.fn(),
  getListCredentialsQueryKey: () => ['/api/v1/google/credentials'],

  // calendars
  useListGoogleCalendars: vi.fn(),
  useSaveSelectedCalendars: vi.fn(),
  useSyncCalendars: vi.fn(),
  getListGoogleCalendarsQueryKey: () => ['/api/v1/google/calendars'],

  // auth
  authorizeGoogle: vi.fn(),
  useGoogleCallback: vi.fn(),
}))

import {
  useListConnections,
  useDisconnectConnection,
  useRefreshConnection,
  useListCredentials,
  useCreateCredentials,
  useValidateCredentials,
  useListGoogleCalendars,
  useSaveSelectedCalendars,
  useSyncCalendars,
  authorizeGoogle,
  useGoogleCallback,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useGoogleConnections,
  useDisconnectConnectionMutation,
  useRefreshConnectionMutation,
} from './useGoogleConnections'

import {
  useGoogleCredentials,
  useCreateCredentialsMutation,
  useValidateCredentialsMutation,
} from './useGoogleCredentials'

import {
  useCalendarsForMember,
  useSaveSelectedCalendarsMutation,
  useSyncCalendarsMutation,
  useStartGoogleAuth,
  useGoogleCallback as reExportedUseGoogleCallback,
} from './useCalendars'

// ── Helper ────────────────────────────────────────────────────────────────────

function makeWrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function makeWrapperWithClient() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

// ── useGoogleConnections ──────────────────────────────────────────────────────

describe('useGoogleConnections', () => {
  it('returns connections from query data', () => {
    vi.mocked(useListConnections).mockReturnValue({
      data: { data: [{ connectionId: 'c1', memberId: 'm1', email: 'a@b.com', name: 'Anna', status: 'ACTIVE', scopes: [] }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListConnections>)

    const { result } = renderHook(() => useGoogleConnections(), { wrapper: makeWrapper() })
    expect(result.current.connections).toHaveLength(1)
    expect(result.current.connections[0].connectionId).toBe('c1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('defaults to empty array when data is undefined', () => {
    vi.mocked(useListConnections).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListConnections>)

    const { result } = renderHook(() => useGoogleConnections(), { wrapper: makeWrapper() })
    expect(result.current.connections).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('polls the connections list every 60 seconds', () => {
    vi.mocked(useListConnections).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListConnections>)

    renderHook(() => useGoogleConnections(), { wrapper: makeWrapper() })
    expect(vi.mocked(useListConnections)).toHaveBeenCalledWith({
      query: { refetchInterval: 60000 },
    })
  })
})

// ── useDisconnectConnectionMutation ───────────────────────────────────────────

describe('useDisconnectConnectionMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useDisconnectConnection).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useDisconnectConnectionMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/connections'] })
  })
})

// ── useRefreshConnectionMutation ──────────────────────────────────────────────

describe('useRefreshConnectionMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useRefreshConnection).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useRefreshConnectionMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/connections'] })
  })
})

// ── useGoogleCredentials ──────────────────────────────────────────────────────

describe('useGoogleCredentials', () => {
  it('returns credentials from query data', () => {
    vi.mocked(useListCredentials).mockReturnValue({
      data: { data: [{ id: 'cr1', nickname: 'Main', redirectUri: 'https://x', isPrimary: true, isActive: true }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListCredentials>)

    const { result } = renderHook(() => useGoogleCredentials(), { wrapper: makeWrapper() })
    expect(result.current.credentials).toHaveLength(1)
    expect(result.current.credentials[0].id).toBe('cr1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('defaults to empty array when data is undefined', () => {
    vi.mocked(useListCredentials).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListCredentials>)

    const { result } = renderHook(() => useGoogleCredentials(), { wrapper: makeWrapper() })
    expect(result.current.credentials).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })
})

// ── useCreateCredentialsMutation ──────────────────────────────────────────────

describe('useCreateCredentialsMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useCreateCredentials).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useCreateCredentialsMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/credentials'] })
  })
})

// ── useValidateCredentialsMutation ────────────────────────────────────────────

describe('useValidateCredentialsMutation', () => {
  it('delegates to useValidateCredentials without extra config', () => {
    const mockMutation = { mutateAsync: vi.fn() }
    vi.mocked(useValidateCredentials).mockReturnValue(mockMutation as never)

    const { result } = renderHook(() => useValidateCredentialsMutation(), { wrapper: makeWrapper() })
    expect(result.current).toBe(mockMutation)
    expect(vi.mocked(useValidateCredentials)).toHaveBeenCalled()
  })
})

// ── useCalendarsForMember ─────────────────────────────────────────────────────

describe('useCalendarsForMember', () => {
  it('returns calendars from query data', () => {
    vi.mocked(useListGoogleCalendars).mockReturnValue({
      data: { data: [{ id: 'cal1', summary: 'Family', isPrimary: true, isSelected: true }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListGoogleCalendars>)

    const { result } = renderHook(() => useCalendarsForMember('m1'), { wrapper: makeWrapper() })
    expect(result.current.calendars).toHaveLength(1)
    expect(result.current.calendars[0].id).toBe('cal1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('defaults to empty array when data is undefined', () => {
    vi.mocked(useListGoogleCalendars).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListGoogleCalendars>)

    const { result } = renderHook(() => useCalendarsForMember('m1'), { wrapper: makeWrapper() })
    expect(result.current.calendars).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('passes memberId as params to useListGoogleCalendars', () => {
    vi.mocked(useListGoogleCalendars).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListGoogleCalendars>)

    renderHook(() => useCalendarsForMember('member-42'), { wrapper: makeWrapper() })
    expect(vi.mocked(useListGoogleCalendars)).toHaveBeenCalledWith({ memberId: 'member-42' })
  })
})

// ── useSaveSelectedCalendarsMutation ─────────────────────────────────────────

describe('useSaveSelectedCalendarsMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useSaveSelectedCalendars).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useSaveSelectedCalendarsMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/calendars'] })
  })
})

// ── useSyncCalendarsMutation ──────────────────────────────────────────────────

describe('useSyncCalendarsMutation', () => {
  it('invalidates both calendars and connections on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useSyncCalendars).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useSyncCalendarsMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/calendars'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/google/connections'] })
  })
})

// ── useStartGoogleAuth ────────────────────────────────────────────────────────

describe('useStartGoogleAuth', () => {
  it('calls authorizeGoogle and resolves to the authUrl string', async () => {
    vi.mocked(authorizeGoogle).mockResolvedValue({
      data: { authUrl: 'https://accounts.google.com/o/oauth2/auth?foo=bar' },
      status: 200,
      headers: new Headers(),
    } as never)

    const { result } = renderHook(() => useStartGoogleAuth(), { wrapper: makeWrapper() })

    let url: string | undefined
    await act(async () => {
      url = await result.current.mutateAsync({ credentialsId: 'cr1', returnUrl: '/dashboard' })
    })
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth?foo=bar')
    expect(vi.mocked(authorizeGoogle)).toHaveBeenCalledWith({ credentialsId: 'cr1', returnUrl: '/dashboard' })
  })

  it('works without params', async () => {
    vi.mocked(authorizeGoogle).mockResolvedValue({
      data: { authUrl: 'https://accounts.google.com/o/oauth2/auth' },
      status: 200,
      headers: new Headers(),
    } as never)

    const { result } = renderHook(() => useStartGoogleAuth(), { wrapper: makeWrapper() })

    let url: string | undefined
    await act(async () => {
      url = await result.current.mutateAsync(undefined)
    })
    expect(url).toBe('https://accounts.google.com/o/oauth2/auth')
    expect(vi.mocked(authorizeGoogle)).toHaveBeenCalledWith(undefined)
  })
})

// ── useGoogleCallback re-export ───────────────────────────────────────────────

describe('useGoogleCallback re-export', () => {
  it('re-exports useGoogleCallback from generated API', () => {
    expect(reExportedUseGoogleCallback).toBe(useGoogleCallback)
  })
})
