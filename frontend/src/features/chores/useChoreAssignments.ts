import { useEffect, useState } from 'react'
import {
  useListChoreAssignments,
  useCompleteChoreAssignment,
  useUndoChoreAssignment,
  getListChoreAssignmentsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { ChoreAssignmentResponse } from '@/api/generated/model'
import { useQueryClient } from '@tanstack/react-query'
import { patchAssignment, type AssignmentsCache } from './choreOptimistic'

/** Taktrate der Rücknahme-Anzeige: alle 30 s neu bewerten, ob die Frist noch läuft. */
export const NOW_TICK_MS = 30_000

/**
 * Das Wanddisplay wird nie neu geladen: ohne Nachladen im Takt blieben die
 * Ausgaben des Morgenlaufs und Erledigungen von anderen Geräten unsichtbar.
 */
export const ASSIGNMENTS_REFETCH_MS = 60_000

export function useChoreAssignments() {
  const query = useListChoreAssignments({ query: { refetchInterval: ASSIGNMENTS_REFETCH_MS } })
  return {
    assignments: (query.data?.data ?? []) as ChoreAssignmentResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/**
 * Optimistisches Abhaken: die Karte springt sofort um, ein Fehler stellt den
 * vorherigen Stand wieder her. Im Altsystem verschwand bei einem Fehler nur der
 * Spinner, ohne jede Meldung — die Meldung selbst gibt `ChoresView` aus.
 */
export function useCompleteAssignmentMutation() {
  const queryClient = useQueryClient()
  const queryKey = getListChoreAssignmentsQueryKey()
  return useCompleteChoreAssignment({
    mutation: {
      onMutate: async ({ id }: { id: string }) => {
        await queryClient.cancelQueries({ queryKey })
        const previous = queryClient.getQueryData<AssignmentsCache>(queryKey)
        queryClient.setQueryData<AssignmentsCache>(queryKey, (cache) =>
          patchAssignment(cache, id, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          }),
        )
        return { previous }
      },
      onError: (_error, _variables, context) => {
        queryClient.setQueryData(queryKey, context?.previous)
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey }),
    },
  })
}

export function useUndoAssignmentMutation() {
  const queryClient = useQueryClient()
  return useUndoChoreAssignment({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListChoreAssignmentsQueryKey() }),
    },
  })
}

/**
 * Eine im Takt weiterrückende Uhr. Ohne sie bliebe der „Rückgängig"-Knopf
 * stehen, bis die Ansicht aus einem anderen Grund neu rendert.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
