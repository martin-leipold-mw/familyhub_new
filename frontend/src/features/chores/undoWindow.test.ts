import { describe, it, expect } from 'vitest'
import { canUndo, UNDO_WINDOW_MS } from './undoWindow'

const now = new Date('2026-09-22T09:05:00Z')

describe('canUndo', () => {
  it('erlaubt die Ruecknahme kurz nach dem Abhaken', () => {
    expect(canUndo('2026-09-22T09:04:00Z', now)).toBe(true)
  })

  it('verweigert sie nach Ablauf der fuenf Minuten', () => {
    expect(canUndo('2026-09-22T08:59:00Z', now)).toBe(false)
  })

  it('verweigert sie genau an der Grenze', () => {
    const grenze = new Date(now.getTime() - UNDO_WINDOW_MS).toISOString()
    expect(canUndo(grenze, now)).toBe(false)
  })

  it('verweigert sie ohne Erledigungszeitpunkt', () => {
    expect(canUndo(null, now)).toBe(false)
    expect(canUndo(undefined, now)).toBe(false)
  })
})
