import { describe, it, expect } from 'vitest'
import { presetToApi, apiToPreset } from './reminders'

describe('reminders', () => {
  it('maps presets to API fields', () => {
    expect(presetToApi('default')).toEqual({ reminderUseDefault: true, reminderMinutes: null })
    expect(presetToApi('none')).toEqual({ reminderUseDefault: false, reminderMinutes: null })
    expect(presetToApi('30m')).toEqual({ reminderUseDefault: false, reminderMinutes: 30 })
    expect(presetToApi('1d')).toEqual({ reminderUseDefault: false, reminderMinutes: 1440 })
  })

  it('maps API fields back to the nearest preset', () => {
    expect(apiToPreset(true, null)).toBe('default')
    expect(apiToPreset(false, null)).toBe('none')
    expect(apiToPreset(false, 60)).toBe('1h')
    expect(apiToPreset(false, 999)).toBe('none') // unknown minutes → none
  })
})
