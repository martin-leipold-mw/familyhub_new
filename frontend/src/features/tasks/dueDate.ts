export type DueTone = 'urgent' | 'overdue' | 'normal'
export type DueLabel = { text: string; tone: DueTone }

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Tagesdifferenz in UTC — beide Seiten auf Mitternacht normalisiert. */
function daysBetween(due: string, today: Date): number {
  const [y, m, d] = due.split('-').map(Number)
  const dueUtc = Date.UTC(y, m - 1, d)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((dueUtc - todayUtc) / 86_400_000)
}

export function formatDueDate(due: string | null | undefined, today: Date): DueLabel | null {
  if (due === null || due === undefined) return null
  const diff = daysBetween(due, today)
  if (diff === 0) return { text: 'Heute', tone: 'urgent' }
  if (diff === 1) return { text: 'Morgen', tone: 'urgent' }
  if (diff < 0) return { text: 'Überfällig', tone: 'overdue' }
  const [, month, day] = due.split('-')
  return { text: `${day}. ${MONTHS[Number(month) - 1]}`, tone: 'normal' }
}
