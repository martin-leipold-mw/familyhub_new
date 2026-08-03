import { vi, describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

const useListAllCalendars = vi.fn()
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListGoogleCalendars: vi.fn(),
  useSaveSelectedCalendars: vi.fn(),
  useSyncCalendars: vi.fn(),
  useListAllCalendars: () => useListAllCalendars(),
  useUpdateCalendarFlags: vi.fn(() => ({ mutateAsync: vi.fn() })),
  getListGoogleCalendarsQueryKey: () => ['cal'],
  getListConnectionsQueryKey: () => ['conn'],
  getListAllCalendarsQueryKey: () => ['all'],
  authorizeGoogle: vi.fn(),
  useGoogleCallback: vi.fn(),
}))

import { useAllCalendars } from './useCalendars'

describe('useAllCalendars', () => {
  it('unwraps the calendars array', () => {
    useListAllCalendars.mockReturnValue({ data: { data: [{ id: 'a', color: 'hsl(1 1% 1%)' }] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useAllCalendars())
    expect(result.current.calendars).toEqual([{ id: 'a', color: 'hsl(1 1% 1%)' }])
  })
})
