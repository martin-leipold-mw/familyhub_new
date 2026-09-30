export type ChoreGroup = 'parents' | 'children' | 'all'

export const INTERVAL_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: 'Täglich' },
  { days: 2, label: 'Alle 2 Tage' },
  { days: 7, label: 'Wöchentlich' },
  { days: 14, label: 'Alle 2 Wochen' },
  { days: 30, label: 'Monatlich' },
  { days: 90, label: 'Vierteljährlich' },
]

/**
 * "Täglich" ist bewusst dabei: im Warteschlangen-Modell kann sich nichts
 * stauen — eine tägliche Aufgabe erscheint frühestens am Tag nach ihrer
 * Erledigung wieder, und die Obergrenze deckelt die Liste ohnehin.
 */
export function intervalLabel(days: number): string {
  const match = INTERVAL_OPTIONS.find((o) => o.days === days)
  return match ? match.label : `Alle ${days} Tage`
}

// Record statt Lookup-Funktion: der Schlüsseltyp deckt genau die drei Werte des
// Vertrags ab, es gibt also keinen Fehlschlag-Zweig, der getestet werden müsste.
export const GROUP_LABELS: Record<ChoreGroup, string> = {
  parents: 'Eltern',
  children: 'Kinder',
  all: 'Alle',
}

export const GROUP_OPTIONS: { value: ChoreGroup; label: string }[] = [
  { value: 'parents', label: GROUP_LABELS.parents },
  { value: 'children', label: GROUP_LABELS.children },
  { value: 'all', label: GROUP_LABELS.all },
]
