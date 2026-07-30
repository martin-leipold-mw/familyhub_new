import { buildRrule, parseRrule, EMPTY_RECURRENCE } from './recurrence'

it('returns null for no recurrence', () => {
  expect(buildRrule(EMPTY_RECURRENCE, { isAllDay: false })).toBeNull()
})

it('builds a weekly rule with weekdays and count', () => {
  const rule = buildRrule(
    { frequency: 'weekly', interval: 1, weekdays: ['MO', 'WE'], end: { type: 'count', count: 10 } },
    { isAllDay: false },
  )
  expect(rule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=10')
})

it('builds an until rule (timed → UTC datetime)', () => {
  const rule = buildRrule(
    { frequency: 'daily', interval: 2, weekdays: [], end: { type: 'until', date: '2026-12-31' } },
    { isAllDay: false },
  )
  expect(rule).toBe('RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261231T235959Z')
})

it('builds an until rule (all-day → date only)', () => {
  const rule = buildRrule(
    { frequency: 'monthly', interval: 1, weekdays: [], end: { type: 'until', date: '2026-12-31' } },
    { isAllDay: true },
  )
  expect(rule).toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20261231')
})

it('round-trips through parseRrule', () => {
  const state = { frequency: 'weekly' as const, interval: 1, weekdays: ['FR' as const], end: { type: 'never' as const } }
  const rule = buildRrule(state, { isAllDay: false })!
  expect(parseRrule(rule)).toEqual(state)
})

it('parseRrule of null/empty yields no recurrence', () => {
  expect(parseRrule(null)).toEqual(EMPTY_RECURRENCE)
})
