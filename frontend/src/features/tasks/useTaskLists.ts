import {
  useListTaskLists,
  useSaveSelectedTaskLists,
  getListTaskListsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { TaskListResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useTaskListsForMember(memberId: string) {
  const query = useListTaskLists({ memberId })
  return {
    taskLists: (query.data?.data ?? []) as TaskListResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useAllTaskLists() {
  const query = useListTaskLists()
  return {
    taskLists: (query.data?.data ?? []) as TaskListResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useSaveSelectedTaskListsMutation() {
  const queryClient = useQueryClient()
  return useSaveSelectedTaskLists({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListTaskListsQueryKey() }),
    },
  })
}
