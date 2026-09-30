import { vi, describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListChores: vi.fn(),
  useCreateChore: vi.fn(),
  useUpdateChore: vi.fn(),
  useDeleteChore: vi.fn(),
  getListChoresQueryKey: () => ['/api/v1/chores'],
}))

import {
  useListChores,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
} from '@/api/generated/endpoints/familyHubAPI'

import {
  useChores,
  useCreateChoreMutation,
  useUpdateChoreMutation,
  useDeleteChoreMutation,
} from './useChores'

function makeWrapperWithClient() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useChores', () => {
  it('liefert die Vorlagen aus der Abfrage', () => {
    vi.mocked(useListChores).mockReturnValue({
      data: { data: [{ id: 'c1', name: 'Toilette putzen', icon: '🚽' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListChores>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChores(), { wrapper })

    expect(result.current.chores).toHaveLength(1)
    expect(result.current.chores[0].id).toBe('c1')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('faellt auf eine leere Liste zurueck, solange nichts geladen ist', () => {
    vi.mocked(useListChores).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListChores>)

    const { wrapper } = makeWrapperWithClient()
    const { result } = renderHook(() => useChores(), { wrapper })

    expect(result.current.chores).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })
})

describe.each([
  ['useCreateChoreMutation', useCreateChore, useCreateChoreMutation],
  ['useUpdateChoreMutation', useUpdateChore, useUpdateChoreMutation],
  ['useDeleteChoreMutation', useDeleteChore, useDeleteChoreMutation],
] as const)('%s', (_name, generated, hook) => {
  it('invalidiert die Vorlagenliste nach Erfolg', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(generated).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const { client, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderHook(() => hook(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/v1/chores'] })
  })
})
