import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { TaskResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useTasks() {
  const query = useListTasks()
  return {
    tasks: (query.data?.data ?? []) as TaskResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient()
  return useCreateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient()
  return useUpdateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient()
  return useDeleteTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  })
}
