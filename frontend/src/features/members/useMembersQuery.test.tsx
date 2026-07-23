import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
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

import { useListMembers } from '@/api/generated/endpoints/familyHubAPI'
import { customFetch } from '@/api/customFetch'
import { useMembers, useUploadAvatarMutation } from './useMembersQuery'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = createTestQueryClient()
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMembersQuery', () => {
  it('returns members from the query data', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: { data: [{ id: '1', name: 'Anna' }] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper })
    expect(result.current.members).toHaveLength(1)
    expect(result.current.members[0].name).toBe('Anna')
  })

  it('defaults to an empty array when data is missing', () => {
    vi.mocked(useListMembers).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useListMembers>)

    const { result } = renderHook(() => useMembers(), { wrapper })
    expect(result.current.members).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('uploads an avatar blob via customFetch', async () => {
    vi.mocked(customFetch).mockResolvedValue({ data: undefined, status: 204 } as never)
    const { result } = renderHook(() => useUploadAvatarMutation(), { wrapper })
    await result.current.mutateAsync({ id: 'm1', blob: new Blob(['x'], { type: 'image/jpeg' }) })
    await waitFor(() => expect(customFetch).toHaveBeenCalled())
    expect(vi.mocked(customFetch).mock.calls[0][0]).toBe('/api/v1/members/m1/avatar')
    expect(vi.mocked(customFetch).mock.calls[0][1]?.method).toBe('PUT')
  })
})
