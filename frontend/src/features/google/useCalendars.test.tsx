import { vi, describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

const useListAllCalendars = vi.fn()
const useUpdateCalendarFlags = vi.fn((_options?: unknown) => ({ mutateAsync: vi.fn() }))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListGoogleCalendars: vi.fn(),
  useSaveSelectedCalendars: vi.fn(),
  useSyncCalendars: vi.fn(),
  useListAllCalendars: () => useListAllCalendars(),
  useUpdateCalendarFlags: (options?: unknown) => useUpdateCalendarFlags(options),
  getListGoogleCalendarsQueryKey: () => ['cal'],
  getListConnectionsQueryKey: () => ['conn'],
  getListAllCalendarsQueryKey: () => ['all'],
  authorizeGoogle: vi.fn(),
  useGoogleCallback: vi.fn(),
}))

import { useAllCalendars, useUpdateCalendarFlagsMutation } from './useCalendars'

describe('useAllCalendars', () => {
  it('unwraps the calendars array', () => {
    useListAllCalendars.mockReturnValue({ data: { data: [{ id: 'a', color: 'hsl(1 1% 1%)' }] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useAllCalendars())
    expect(result.current.calendars).toEqual([{ id: 'a', color: 'hsl(1 1% 1%)' }])
  })

  it('falls back to an empty array while there is no data yet', () => {
    useListAllCalendars.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { result } = renderHook(() => useAllCalendars())
    expect(result.current.calendars).toEqual([])
  })
})

describe('useUpdateCalendarFlagsMutation', () => {
  it('invalidates both the google and all-calendars queries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    useUpdateCalendarFlags.mockImplementation(((options?: { mutation?: { onSuccess?: (...args: unknown[]) => void } }) => {
      if (options?.mutation?.onSuccess) onSuccessRef.fn = options.mutation.onSuccess
      return { mutateAsync: vi.fn() }
    }) as never)

    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    renderHook(() => useUpdateCalendarFlagsMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cal'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['all'] })
  })
})
