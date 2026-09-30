import type { ChoreAssignmentResponse, MemberResponse } from '@/api/generated/model'

export type ChoreLaneModel = {
  member: MemberResponse
  open: ChoreAssignmentResponse[]
  completed: ChoreAssignmentResponse[]
}

// Nach Ausgabetag: was am längsten liegt, steht oben. Bei Gleichstand nach
// Name, damit die Reihenfolge zwischen zwei Renderings stabil bleibt.
function byAgeThenName(a: ChoreAssignmentResponse, b: ChoreAssignmentResponse): number {
  return a.assignedOn === b.assignedOn
    ? a.name.localeCompare(b.name, 'de')
    : a.assignedOn.localeCompare(b.assignedOn)
}

/**
 * Eine Spalte je aktivem Mitglied — auch ohne Aufgaben, denn eine fehlende
 * Spalte sähe aus wie ein Fehler. Erledigtes bleibt bis zum nächsten Morgen
 * sichtbar und wandert ans Ende der Lane.
 */
export function buildChoreLanes(
  members: MemberResponse[],
  assignments: ChoreAssignmentResponse[],
): ChoreLaneModel[] {
  return members
    .filter((m) => m.isActive)
    .map((member) => {
      const mine = assignments.filter((a) => a.memberId === member.id)
      return {
        member,
        open: mine.filter((a) => a.status === 'open').sort(byAgeThenName),
        completed: mine.filter((a) => a.status === 'completed').sort(byAgeThenName),
      }
    })
}
