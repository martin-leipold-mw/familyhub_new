import { vi, describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListTasks: vi.fn(),
  useCreateTask: vi.fn(),
  useUpdateTask: vi.fn(),
  useDeleteTask: vi.fn(),
  getListTasksQueryKey: () => ['/api/v1/tasks'],
}))

import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useTasks,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
} from './useTasks'

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

describe('useTasks', () => {
  it('returns tasks from query data', () => {
    vi.mocked(useListTasks).mockReturnValue({
      data: { data: [{ id: 't1', memberId: 'm1', title: 'Einkaufen', status: 'OPEN' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListTasks>)

    const { result } = renderHook(() => useTasks(), { wrapper: makeWrapper() })
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0].id).toBe('t1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('defaults to an empty array when data is undefined', () => {
    vi.mocked(useListTasks).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListTasks>)

    const { result } = renderHook(() => useTasks(), { wrapper: makeWrapper() })
    expect(result.current.tasks).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })
})

describe('useCreateTaskMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useCreateTask).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useCreateTaskMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/tasks'] })
  })
})

describe('useUpdateTaskMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useUpdateTask).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useUpdateTaskMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/tasks'] })
  })
})

describe('useDeleteTaskMutation', () => {
  it('calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useDeleteTask).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => useDeleteTaskMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/tasks'] })
  })
})
