export type DueTone = 'urgent' | 'overdue' | 'normal'
export type DueLabel = { text: string; tone: DueTone }

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/**
 * Tagesdifferenz zwischen dem Fälligkeitsdatum (kalenderdatum, keine Uhrzeit)
 * und dem lokalen Kalendertag von `today`. `due` wird als UTC-Mitternacht
 * normalisiert (String-Parsing statt `new Date(str)`, um die UTC-Mitternacht-
 * Falle zu vermeiden); `today` wird über die lokalen Getter auf denselben
 * Kalendertag normalisiert — nicht über die UTC-Getter, da diese in jeder
 * Zeitzone östlich von UTC (u. a. CET/CEST) zwischen lokaler Mitternacht und
 * UTC-Mitternacht noch den Vortag liefern und "Heute"/"Überfällig" auf einem
 * 24/7-Display in genau diesem Fenster falsch berechnen würden.
 */
function daysBetween(due: string, today: Date): number {
  const [y, m, d] = due.split('-').map(Number)
  const dueUtc = Date.UTC(y, m - 1, d)
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
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
