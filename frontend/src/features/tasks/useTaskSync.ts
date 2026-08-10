import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  syncTaskLists,
  getListTasksQueryKey,
  getListConnectionsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'

export function useTaskSync() {
  const queryClient = useQueryClient()
  const { connections } = useGoogleConnections()
  const [isSyncing, setIsSyncing] = useState(false)
  const [isError, setIsError] = useState(false)

  const sync = useCallback(async () => {
    setIsSyncing(true)
    setIsError(false)
    try {
      const memberIds = [
        ...new Set(
          connections
            .filter((c) => c.status.toLowerCase() !== 'revoked')
            .map((c) => c.memberId),
        ),
      ]
      const results = await Promise.allSettled(
        memberIds.map((memberId) => syncTaskLists({ memberId })),
      )
      if (results.some((r) => r.status === 'rejected')) setIsError(true)
      await queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() })
      await queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() })
    } catch {
      setIsError(true)
    } finally {
      setIsSyncing(false)
    }
  }, [connections, queryClient])

  return { sync, isSyncing, isError }
}
