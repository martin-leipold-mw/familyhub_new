import { describe, it, expect } from 'vitest'
import {
  verticalPosition,
  layoutDay,
  nowLineTop,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
} from './layout'

const at = (h: number, m = 0) => new Date(2026, 6, 21, h, m)

describe('verticalPosition', () => {
  it('positions a 09:00–10:00 block', () => {
    const { top, height } = verticalPosition(at(9), at(10))
    expect(top).toBe(150) // (9-6)*50
    expect(height).toBe(50)
  })
  it('accounts for minutes', () => {
    const { top } = verticalPosition(at(6, 30), at(7))
    expect(top).toBe(25)
  })
  it('clamps a block that starts before 06:00', () => {
    const { top, height } = verticalPosition(at(5), at(7))
    expect(top).toBe(0)
    expect(height).toBe(50) // only 06:00–07:00 is visible
  })
  it('clamps a block that ends after 22:00', () => {
    const { top, height } = verticalPosition(at(21), at(23, 30))
    expect(top).toBe(750)
    expect(height).toBe(GRID_HEIGHT_PX - 750) // clamped to 22:00
  })
  it('enforces a minimum height', () => {
    const { height } = verticalPosition(at(9), at(9, 10))
    expect(height).toBe(MIN_BLOCK_PX)
  })
})

describe('layoutDay overlap columns', () => {
  it('gives a lone event full width', () => {
    const out = layoutDay([{ id: 'a', start: at(9), end: at(10) }])
    expect(out[0].widthPct).toBe(100)
    expect(out[0].leftPct).toBe(0)
  })
  it('splits two overlapping events into halves', () => {
    const out = layoutDay([
      { id: 'a', start: at(9), end: at(11) },
      { id: 'b', start: at(10), end: at(12) },
    ])
    const a = out.find((x) => x.id === 'a')!
    const b = out.find((x) => x.id === 'b')!
    expect(a.widthPct).toBe(50)
    expect(b.widthPct).toBe(50)
    expect(new Set([a.leftPct, b.leftPct])).toEqual(new Set([0, 50]))
  })
  it('does not split non-overlapping events', () => {
    const out = layoutDay([
      { id: 'a', start: at(9), end: at(10) },
      { id: 'b', start: at(11), end: at(12) },
    ])
    expect(out.every((x) => x.widthPct === 100)).toBe(true)
  })
})

describe('nowLineTop', () => {
  it('returns pixel offset inside 06–22', () => {
    expect(nowLineTop(at(12))).toBe(300) // (12-6)*50
  })
  it('returns null before 06:00', () => {
    expect(nowLineTop(at(5, 59))).toBeNull()
  })
  it('returns null at/after 22:00', () => {
    expect(nowLineTop(at(22))).toBeNull()
    expect(nowLineTop(at(23))).toBeNull()
  })
})
