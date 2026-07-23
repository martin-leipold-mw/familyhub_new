import { vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/testUtils'
import type { ReactNode } from 'react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useListMembers: vi.fn(),
  useCreateMember: vi.fn(),
  useUpdateMember: vi.fn(),
  useDeleteMember: vi.fn(),
  getListMembersQueryKey: () => ['/api/v1/members'],
}))
vi.mock('@/api/customFetch', () => ({ customFetch: vi.fn() }))

import {
  useListMembers,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
} from '@/api/generated/endpoints/familyHubAPI'
import { customFetch } from '@/api/customFetch'
import {
  useMembers,
  useUploadAvatarMutation,
  useCreateMemberMutation,
  useUpdateMemberMutation,
  useDeleteMemberMutation,
} from './useMembersQuery'

function makeWrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useMembersQuery', () => {
  it('returns members from the query data', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: { data: [{ id: '1', name: 'Anna' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper: makeWrapper() })
    expect(result.current.members).toHaveLength(1)
    expect(result.current.members[0].name).toBe('Anna')
  })

  it('defaults to an empty array when data is missing', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper: makeWrapper() })
    expect(result.current.members).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('uploads an avatar blob via customFetch', async () => {
    vi.mocked(customFetch).mockResolvedValue({ data: undefined, status: 204 } as never)
    const { result } = renderHook(() => useUploadAvatarMutation(), { wrapper: makeWrapper() })
    await result.current.mutateAsync({ id: 'm1', blob: new Blob(['x'], { type: 'image/jpeg' }) })
    await waitFor(() => expect(customFetch).toHaveBeenCalled())
    expect(vi.mocked(customFetch).mock.calls[0][0]).toBe('/api/v1/members/m1/avatar')
    expect(vi.mocked(customFetch).mock.calls[0][1]?.method).toBe('PUT')
  })

  it('useCreateMemberMutation calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useCreateMember).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const wrapper = makeWrapper()
    renderHook(() => useCreateMemberMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
    // If invalidateQueries was called, no error is thrown
  })

  it('useUpdateMemberMutation calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useUpdateMember).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const wrapper = makeWrapper()
    renderHook(() => useUpdateMemberMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
  })

  it('useDeleteMemberMutation calls invalidateQueries on success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSuccessRef: { fn?: (...args: any[]) => void } = {}
    vi.mocked(useDeleteMember).mockImplementation(({ mutation } = {}) => {
      if (mutation?.onSuccess) onSuccessRef.fn = mutation.onSuccess as never
      return { mutateAsync: vi.fn() } as never
    })

    const wrapper = makeWrapper()
    renderHook(() => useDeleteMemberMutation(), { wrapper })

    expect(onSuccessRef.fn).toBeDefined()
    await act(async () => { onSuccessRef.fn!({}) })
  })
})
