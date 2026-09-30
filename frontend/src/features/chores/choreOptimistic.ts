import type { ChoreAssignmentResponse } from '@/api/generated/model'

export type AssignmentsCache = { data: ChoreAssignmentResponse[] } | undefined

/**
 * Der einzige Verzweigungspunkt des optimistischen Abhakens — bewusst hier und
 * nicht im Hook, damit alle drei Fälle ohne React-Testaufbau prüfbar sind.
 */
export function patchAssignment(
  cache: AssignmentsCache,
  id: string,
  patch: Partial<ChoreAssignmentResponse>,
): AssignmentsCache {
  if (cache === undefined) return cache
  return { ...cache, data: cache.data.map((a) => (a.id === id ? { ...a, ...patch } : a)) }
}
