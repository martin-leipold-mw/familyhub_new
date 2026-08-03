import {
  useListConnections,
  useDisconnectConnection,
  useRefreshConnection,
  getListConnectionsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { ConnectionResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'

export function useGoogleConnections() {
  const query = useListConnections({ query: { refetchInterval: 60000 } })
  return {
    connections: (query.data?.data ?? []) as ConnectionResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useDisconnectConnectionMutation() {
  const queryClient = useQueryClient()
  return useDisconnectConnection({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() }),
    },
  })
}

export function useRefreshConnectionMutation() {
  const queryClient = useQueryClient()
  return useRefreshConnection({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() }),
    },
  })
}
