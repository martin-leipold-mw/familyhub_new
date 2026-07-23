import { MEMBER_COLORS, MEMBER_COLOR_KEYS, roleLabel } from './colors'

describe('colors', () => {
  it('maps every color to its HSL value', () => {
    expect(MEMBER_COLORS.blue).toBe('hsl(210 80% 70%)')
    expect(MEMBER_COLORS.pink).toBe('hsl(340 75% 75%)')
    expect(MEMBER_COLORS.green).toBe('hsl(140 60% 65%)')
    expect(MEMBER_COLORS.purple).toBe('hsl(270 60% 70%)')
    expect(MEMBER_COLORS.orange).toBe('hsl(30 85% 65%)')
    expect(MEMBER_COLORS.teal).toBe('hsl(180 55% 60%)')
  })

  it('exposes exactly six color keys', () => {
    expect(MEMBER_COLOR_KEYS).toHaveLength(6)
  })

  it('translates roles to German labels', () => {
    expect(roleLabel('parent')).toBe('Elternteil')
    expect(roleLabel('child')).toBe('Kind')
  })
})
