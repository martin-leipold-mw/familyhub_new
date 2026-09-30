/** Dieselbe Frist wie im Backend (`UNDO_WINDOW_SECONDS`). */
export const UNDO_WINDOW_MS = 5 * 60 * 1000

/**
 * Nur eine Anzeigeentscheidung: der Server prüft die Frist noch einmal und
 * antwortet nach Ablauf mit 400. Die Uhren müssen also nicht exakt gleich gehen.
 */
export function canUndo(completedAt: string | null | undefined, now: Date): boolean {
  if (!completedAt) return false
  return now.getTime() - Date.parse(completedAt) < UNDO_WINDOW_MS
}
