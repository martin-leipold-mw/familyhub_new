import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListChoreAssignments: vi.fn(),
  useCompleteChoreAssignment: vi.fn(),
  useUndoChoreAssignment: vi.fn(),
  getListChoreAssignmentsQueryKey: () => ['/api/v1/chore-assignments'],
}))

import {
  useListChoreAssignments,
  useCompleteChoreAssignment,
  useUndoChoreAssignment,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useChoreAssignments,
  useCompleteAssignmentMutation,
  useUndoAssignmentMutation,
  useNow,
  NOW_TICK_MS,
  ASSIGNMENTS_REFETCH_MS,
} from './useChoreAssignments'

function makeWrapperWithClient() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const KEY = ['/api/v1/chore-assignments']

describe('useChoreAssignments', () => {
  it('liefert die Zuweisungen aus der Abfrage', () => {
    vi.mocked(useListChoreAssignments).mockReturnValue({
      data: { data: [{ id: 'a1', memberId: 'm1', status: 'open' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListChoreAssignments>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChoreAssignments(), { wrapper })

    expect(result.current.assignments).toHaveLength(1)
    expect(result.current.isError).toBe(false)
  })

  it('laedt die Liste jede Minute neu, damit das Wanddisplay aktuell bleibt', () => {
    vi.mocked(useListChoreAssignments).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListChoreAssignments>)

    const { wrapper } = makeWrapperWithClient()
    renderHook(() => useChoreAssignments(), { wrapper })

    expect(useListChoreAssignments).toHaveBeenCalledWith({ query: { refetchInterval: ASSIGNMENTS_REFETCH_MS } })
    expect(ASSIGNMENTS_REFETCH_MS).toBe(60_000)
  })

  it('faellt auf eine leere Liste zurueck, solange nichts geladen ist', () => {
    vi.mocked(useListChoreAssignments).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useListChoreAssignments>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChoreAssignments(), { wrapper })

    expect(result.current.assignments).toEqual([])
    expect(result.current.isError).toBe(true)
  })
})

describe('useCompleteAssignmentMutation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
    vi.mocked(useCompleteChoreAssignment).mockImplementation(({ mutation } = {}) => {
      captured = mutation
      return { mutateAsync: vi.fn() } as never
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setzt die Zuweisung optimistisch auf erledigt', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    client.setQueryData(KEY, { data: [{ id: 'a1', status: 'open' }] })
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    await act(async () => { await captured.onMutate({ id: 'a1' }) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = client.getQueryData(KEY) as any
    expect(cached.data[0].status).toBe('completed')
    expect(cached.data[0].completedAt).toBe('2026-09-22T09:00:00.000Z')
  })

  it('stellt den vorherigen Stand bei einem Fehler wieder her', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    const before = { data: [{ id: 'a1', status: 'open' }] }
    client.setQueryData(KEY, before)
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    const context = await act(async () => captured.onMutate({ id: 'a1' }))
    await act(async () => { captured.onError(new Error('kaputt'), { id: 'a1' }, await context) })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client.getQueryData(KEY) as any).data[0].status).toBe('open')
  })

  it('laedt die Liste nach Abschluss neu', async () => {
    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useCompleteAssignmentMutation(), { wrapper })

    await act(async () => { captured.onSettled() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY })
  })
})

describe('useUndoAssignmentMutation', () => {
  it('laedt die Liste nach Erfolg neu', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useUndoChoreAssignment).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useUndoAssignmentMutation(), { wrapper })

    await act(async () => { onSuccessRef.fn!({}) })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: KEY })
  })
})

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T09:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rueckt die Uhr im Takt weiter', () => {
    const { result } = renderHook(() => useNow(NOW_TICK_MS))
    const first = result.current

    act(() => { vi.advanceTimersByTime(NOW_TICK_MS) })

    expect(result.current.getTime()).toBeGreaterThan(first.getTime())
  })

  it('raeumt den Taktgeber beim Abbau ab', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useNow(NOW_TICK_MS))

    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })
})
