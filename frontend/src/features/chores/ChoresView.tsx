import { useQueryClient } from '@tanstack/react-query'
import {
  getListChoreAssignmentsQueryKey,
  getListMembersQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import { useMembers } from '@/features/members/useMembersQuery'
import { useSnackbar } from '@/routing/SnackbarProvider'
import { ChoreLane } from './ChoreLane'
import { buildChoreLanes } from './choreLanes'
import {
  useChoreAssignments,
  useCompleteAssignmentMutation,
  useUndoAssignmentMutation,
  useNow,
  NOW_TICK_MS,
} from './useChoreAssignments'

/**
 * Das Wanddisplay-Raster: `auto-fit` mit fester Mindestbreite je Spalte. Bei
 * vielen Mitgliedern scrollt es waagerecht, statt die Spalten unlesbar schmal
 * zu quetschen.
 */
export function ChoresView() {
  const queryClient = useQueryClient()
  const assignmentsQuery = useChoreAssignments()
  const membersQuery = useMembers()
  const { assignments } = assignmentsQuery
  const { members } = membersQuery
  // Beide Abfragen gemeinsam: sonst blitzt „Noch keine Familienmitglieder
  // angelegt." auf, solange die Mitglieder noch unterwegs sind.
  const isLoading = assignmentsQuery.isLoading || membersQuery.isLoading
  const isError = assignmentsQuery.isError || membersQuery.isError
  const { show } = useSnackbar()
  const now = useNow(NOW_TICK_MS)
  const completeMutation = useCompleteAssignmentMutation()
  const undoMutation = useUndoAssignmentMutation()

  const lanes = buildChoreLanes(members, assignments)

  function handleComplete(id: string) {
    completeMutation.mutate(
      { id },
      {
        onError: () =>
          show({ id: `chore-complete-${id}`, message: 'Abhaken fehlgeschlagen. Bitte noch einmal versuchen.' }),
      },
    )
  }

  function handleUndo(id: string) {
    undoMutation.mutate(
      { id },
      {
        onError: () =>
          show({
            id: `chore-undo-${id}`,
            message: 'Rückgängig fehlgeschlagen. Die 5-Minuten-Frist ist vermutlich abgelaufen.',
          }),
      },
    )
  }

  function handleRetry() {
    void queryClient.invalidateQueries({ queryKey: getListChoreAssignmentsQueryKey() })
    void queryClient.invalidateQueries({ queryKey: getListMembersQueryKey() })
  }

  return (
    <div className="min-h-screen bg-bg p-4 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary mr-auto">Haushalt</h1>
      </header>

      {isError && (
        <div className="flex items-center gap-3 rounded-xl bg-danger-weak p-3">
          <span className="text-danger">Fehler beim Laden der Haushaltsaufgaben.</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-danger px-3 py-2 min-h-[44px] text-white"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Wird geladen…</p>}

      {!isLoading && !isError && lanes.length === 0 && (
        <p className="text-muted">Noch keine Familienmitglieder angelegt.</p>
      )}

      {!isLoading && !isError && lanes.length > 0 && (
        <div className="grid gap-4 overflow-x-auto [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
          {lanes.map((lane) => (
            <ChoreLane
              key={lane.member.id}
              lane={lane}
              now={now}
              onComplete={handleComplete}
              onUndo={handleUndo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
