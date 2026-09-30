import type { ChoreResponse, MemberResponse } from '@/api/generated/model'

export type ChoreStatusTone = 'paused' | 'open' | 'due' | 'waiting' | 'blocked'
export type ChoreStatus = { text: string; tone: ChoreStatusTone }

// Beide Werte sind reine Kalenderdaten (YYYY-MM-DD) aus der Haushaltszeitzone;
// über Date.UTC verglichen gibt es keine Zeitzonen-Verschiebung um einen Tag.
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function inGroup(member: MemberResponse, group: string): boolean {
  if (group === 'parents') return member.role === 'parent'
  if (group === 'children') return member.role === 'child'
  return true
}

export function groupPoolSize(group: string, members: MemberResponse[]): number {
  return members.filter((m) => m.isActive && inGroup(m, group)).length
}

function ageText(days: number): string {
  if (days === 0) return 'seit heute'
  if (days === 1) return 'seit 1 Tag'
  return `seit ${days} Tagen`
}

/**
 * Der Zustandstext einer Vorlage auf der Verwaltungsseite. Er beantwortet die
 * Frage, die die Familienansicht bewusst nicht stellt: warum taucht diese
 * Aufgabe gerade nirgends auf? Ohne ihn gäbe es keine Stelle, an der man einem
 * stillstehenden Ämtli nachgehen könnte.
 */
export function choreStatus(
  chore: ChoreResponse,
  members: MemberResponse[],
  today: string,
): ChoreStatus {
  if (!chore.isActive) return { text: 'Pausiert', tone: 'paused' }

  const open = chore.openAssignment
  if (open) {
    return { text: `Offen bei ${open.memberName} · ${ageText(daysBetween(open.assignedOn, today))}`, tone: 'open' }
  }

  const daysUntilDue = daysBetween(today, chore.nextDueOn)
  if (daysUntilDue > 0) {
    const text = daysUntilDue === 1 ? 'Wieder fällig morgen' : `Wieder fällig in ${daysUntilDue} Tagen`
    return { text, tone: 'due' }
  }

  // Fällig, aber nicht ausgegeben: entweder ist die Gruppe leer, oder alle in
  // ihr stehen am Limit von fünf offenen Aufgaben.
  if (groupPoolSize(chore.assignmentGroup, members) === 0) {
    return { text: 'Keine Mitglieder in dieser Gruppe', tone: 'blocked' }
  }
  return { text: 'Wartet auf freien Platz', tone: 'waiting' }
}
