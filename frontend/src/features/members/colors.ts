export type MemberColor = 'blue' | 'pink' | 'green' | 'purple' | 'orange' | 'teal'
export type MemberRole = 'parent' | 'child'

export const MEMBER_COLORS: Record<MemberColor, string> = {
  blue: 'hsl(210 80% 70%)',
  pink: 'hsl(340 75% 75%)',
  green: 'hsl(140 60% 65%)',
  purple: 'hsl(270 60% 70%)',
  orange: 'hsl(30 85% 65%)',
  teal: 'hsl(180 55% 60%)',
}

export const MEMBER_COLOR_KEYS = Object.keys(MEMBER_COLORS) as MemberColor[]

export function memberColorHex(color: string): string {
  return MEMBER_COLORS[color as MemberColor] ?? MEMBER_COLORS.blue
}

export function roleLabel(role: string): string {
  return role === 'parent' ? 'Elternteil' : 'Kind'
}
