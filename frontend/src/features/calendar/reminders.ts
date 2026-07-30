export type ReminderPreset = 'default' | 'none' | '10m' | '30m' | '1h' | '1d'

const MINUTES: Record<Exclude<ReminderPreset, 'default' | 'none'>, number> = {
  '10m': 10,
  '30m': 30,
  '1h': 60,
  '1d': 1440,
}

export const REMINDER_OPTIONS: { value: ReminderPreset; label: string }[] = [
  { value: 'default', label: 'Standard des Kalenders' },
  { value: 'none', label: 'Keine' },
  { value: '10m', label: '10 Minuten vorher' },
  { value: '30m', label: '30 Minuten vorher' },
  { value: '1h', label: '1 Stunde vorher' },
  { value: '1d', label: '1 Tag vorher' },
]

export function presetToApi(p: ReminderPreset): { reminderUseDefault: boolean; reminderMinutes: number | null } {
  if (p === 'default') return { reminderUseDefault: true, reminderMinutes: null }
  if (p === 'none') return { reminderUseDefault: false, reminderMinutes: null }
  return { reminderUseDefault: false, reminderMinutes: MINUTES[p] }
}

export function apiToPreset(useDefault: boolean, minutes: number | null): ReminderPreset {
  if (useDefault) return 'default'
  if (minutes == null) return 'none'
  const match = (Object.keys(MINUTES) as (keyof typeof MINUTES)[]).find((k) => MINUTES[k] === minutes)
  return match ?? 'none'
}
