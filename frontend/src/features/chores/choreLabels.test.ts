import { describe, it, expect } from 'vitest'
import { INTERVAL_OPTIONS, intervalLabel, GROUP_OPTIONS, GROUP_LABELS } from './choreLabels'

describe('intervalLabel', () => {
  it('benennt jedes Intervall der Palette', () => {
    expect(intervalLabel(1)).toBe('Täglich')
    expect(intervalLabel(2)).toBe('Alle 2 Tage')
    expect(intervalLabel(7)).toBe('Wöchentlich')
    expect(intervalLabel(14)).toBe('Alle 2 Wochen')
    expect(intervalLabel(30)).toBe('Monatlich')
    expect(intervalLabel(90)).toBe('Vierteljährlich')
  })

  it('faellt fuer ein Intervall ausserhalb der Palette auf Tage zurueck', () => {
    // Über die API ist jedes intervalDays > 0 möglich, nicht nur die sechs Kacheln.
    expect(intervalLabel(3)).toBe('Alle 3 Tage')
  })
})

describe('GROUP_LABELS', () => {
  it('benennt alle drei Zuweisungsgruppen deutsch', () => {
    expect(GROUP_LABELS.parents).toBe('Eltern')
    expect(GROUP_LABELS.children).toBe('Kinder')
    expect(GROUP_LABELS.all).toBe('Alle')
  })
})

describe('Paletten', () => {
  it('bieten sechs Intervalle und drei Gruppen an', () => {
    expect(INTERVAL_OPTIONS).toHaveLength(6)
    expect(GROUP_OPTIONS.map((g) => g.value)).toEqual(['parents', 'children', 'all'])
  })
})
