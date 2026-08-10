import { vi, describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

const useListTaskLists = vi.fn()
const useSaveSelectedTaskLists = vi.fn((_options?: unknown) => ({ mutateAsync: vi.fn() }))
vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListTaskLists: (params?: unknown) => useListTaskLists(params),
  useSaveSelectedTaskLists: (options?: unknown) => useSaveSelectedTaskLists(options),
  getListTaskListsQueryKey: () => ['task-lists'],
}))

import { useTaskListsForMember, useAllTaskLists, useSaveSelectedTaskListsMutation } from './useTaskLists'

describe('useTaskListsForMember', () => {
  it('unwraps the task lists array', () => {
    useListTaskLists.mockReturnValue({ data: { data: [{ id: 'tl1', title: 'Zuhause' }] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useTaskListsForMember('m1'))
    expect(result.current.taskLists).toEqual([{ id: 'tl1', title: 'Zuhause' }])
    expect(useListTaskLists).toHaveBeenCalledWith({ memberId: 'm1' })
  })

  it('falls back to an empty array while there is no data yet', () => {
    useListTaskLists.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { result } = renderHook(() => useTaskListsForMember('m1'))
    expect(result.current.taskLists).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useAllTaskLists', () => {
  it('unwraps the task lists array', () => {
    useListTaskLists.mockReturnValue({ data: { data: [{ id: 'tl1', title: 'Zuhause' }] }, isLoading: false, isError: false })
    const { result } = renderHook(() => useAllTaskLists())
    expect(result.current.taskLists).toEqual([{ id: 'tl1', title: 'Zuhause' }])
    expect(useListTaskLists).toHaveBeenCalledWith(undefined)
  })

  it('falls back to an empty array while there is no data yet', () => {
    useListTaskLists.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { result } = renderHook(() => useAllTaskLists())
    expect(result.current.taskLists).toEqual([])
    expect(result.current.isError).toBe(true)
  })
})

describe('useSaveSelectedTaskListsMutation', () => {
  it('invalidates the task-lists query on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    useSaveSelectedTaskLists.mockImplementation(((options?: { mutation?: { onSuccess?: (...args: unknown[]) => void } }) => {
      if (options?.mutation?.onSuccess) onSuccessRef.fn = options.mutation.onSuccess
      return { mutateAsync: vi.fn() }
    }) as never)

    const client = createTestQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    renderHook(() => useSaveSelectedTaskListsMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['task-lists'] })
  })
})
