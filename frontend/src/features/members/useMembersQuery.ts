import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useListMembers,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  getListMembersQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { MemberResponse } from '@/api/generated/model'
import { customFetch } from '@/api/customFetch'

export function useMembers() {
  const query = useListMembers()
  return {
    members: (query.data?.data ?? []) as MemberResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateMemberMutation() {
  const queryClient = useQueryClient()
  return useCreateMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useUpdateMemberMutation() {
  const queryClient = useQueryClient()
  return useUpdateMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useDeleteMemberMutation() {
  const queryClient = useQueryClient()
  return useDeleteMember({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
    },
  })
}

export function useUploadAvatarMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, blob }: { id: string; blob: Blob }) =>
      customFetch(`/api/v1/members/${id}/avatar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() }),
  })
}
