import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  syncCalendars,
  getListEventsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'

export function useCalendarSync() {
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
      for (const memberId of memberIds) {
        await syncCalendars({ memberId })
      }
      await queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() })
    } catch {
      setIsError(true)
    } finally {
      setIsSyncing(false)
    }
  }, [connections, queryClient])

  return { sync, isSyncing, isError }
}
