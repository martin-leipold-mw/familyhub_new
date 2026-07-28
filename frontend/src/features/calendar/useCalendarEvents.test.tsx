import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'
import type { EventResponse } from '@/api/generated/model'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListEvents: vi.fn(),
  useCreateEvent: vi.fn(),
  useUpdateEvent: vi.fn(),
  useDeleteEvent: vi.fn(),
  getListEventsQueryKey: () => ['/api/v1/events'],
}))

import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from '@/api/generated/endpoints/familyHubAPI'
import {
  toCalendarEvent,
  useCalendarEvents,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
} from './useCalendarEvents'

function makeWrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('toCalendarEvent', () => {
  it('parses a timed event into Date objects', () => {
    const raw: EventResponse = {
      id: '1',
      title: 'Schule',
      isAllDay: false,
      start: '2026-07-21T09:00:00Z',
      end: '2026-07-21T10:00:00Z',
      memberId: 'm1',
      calendarId: 'c1',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.start).toBeInstanceOf(Date)
    expect(ev.end).toBeInstanceOf(Date)
    expect(ev.isAllDay).toBe(false)
    expect(ev.title).toBe('Schule')
  })

  it('keeps all-day dates as strings and leaves start/end null', () => {
    const raw: EventResponse = {
      id: '2',
      title: 'Urlaub',
      isAllDay: true,
      allDayStart: '2026-07-21',
      allDayEnd: '2026-07-23',
      memberId: 'm1',
      calendarId: 'c1',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.start).toBeNull()
    expect(ev.allDayStart).toBe('2026-07-21')
    expect(ev.allDayEnd).toBe('2026-07-23')
  })

  it('leaves end null when a timed event has no end', () => {
    const raw: EventResponse = {
      id: '3',
      title: 'Offen',
      isAllDay: false,
      start: '2026-07-21T09:00:00Z',
      memberId: 'm1',
      calendarId: 'c1',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.start).toBeInstanceOf(Date)
    expect(ev.end).toBeNull()
  })

  it('keeps location and description when present', () => {
    const raw: EventResponse = {
      id: '4',
      title: 'Arzttermin',
      isAllDay: false,
      start: '2026-07-21T09:00:00Z',
      end: '2026-07-21T10:00:00Z',
      memberId: 'm1',
      calendarId: 'c1',
      location: 'Praxis Dr. Müller',
      description: 'Jährliche Kontrolle',
    }
    const ev = toCalendarEvent(raw)
    expect(ev.location).toBe('Praxis Dr. Müller')
    expect(ev.description).toBe('Jährliche Kontrolle')
  })
})

describe('useCalendarEvents', () => {
  it('maps query data into calendar events', () => {
    vi.mocked(useListEvents).mockReturnValue({
      data: {
        data: [
          {
            id: '1',
            title: 'Schule',
            isAllDay: false,
            start: '2026-07-21T09:00:00Z',
            end: '2026-07-21T10:00:00Z',
            memberId: 'm1',
            calendarId: 'c1',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListEvents>)

    const { result } = renderHook(() => useCalendarEvents(new Date(2026, 6, 21), 'week'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].title).toBe('Schule')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('defaults to an empty array when data is missing and forwards refetch', () => {
    const refetch = vi.fn()
    vi.mocked(useListEvents).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useListEvents>)

    const { result } = renderHook(() => useCalendarEvents(new Date(2026, 6, 21), 'day'), {
      wrapper: makeWrapper(),
    })
    expect(result.current.events).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isError).toBe(true)
    result.current.refetch()
    expect(refetch).toHaveBeenCalled()
  })
})

describe('mutation hooks invalidate the events query on success', () => {
  it('useCreateEventMutation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useCreateEvent).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(() => useCreateEventMutation(), { wrapper })
    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/events'] }))
  })

  it('useUpdateEventMutation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useUpdateEvent).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(() => useUpdateEventMutation(), { wrapper })
    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/events'] }))
  })

  it('useDeleteEventMutation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useDeleteEvent).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })
    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    renderHook(() => useDeleteEventMutation(), { wrapper })
    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/events'] }))
  })
})
