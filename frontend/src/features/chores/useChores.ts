import {
  useListChores,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
  getListChoresQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { ChoreResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useChores() {
  const query = useListChores()
  return {
    chores: (query.data?.data ?? []) as ChoreResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateChoreMutation() {
  const queryClient = useQueryClient()
  return useCreateChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}

export function useUpdateChoreMutation() {
  const queryClient = useQueryClient()
  return useUpdateChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}

export function useDeleteChoreMutation() {
  const queryClient = useQueryClient()
  return useDeleteChore({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChoresQueryKey() }),
    },
  })
}
