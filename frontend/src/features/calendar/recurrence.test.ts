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

it('parses a COUNT end back into a RecurrenceState', () => {
  expect(parseRrule('RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5')).toEqual({
    frequency: 'daily',
    interval: 2,
    weekdays: [],
    end: { type: 'count', count: 5 },
  })
})

it('ignores malformed segments without a key=value pair', () => {
  expect(parseRrule('RRULE:FREQ=DAILY;;INTERVAL=1')).toEqual({
    frequency: 'daily',
    interval: 1,
    weekdays: [],
    end: { type: 'never' },
  })
})

it('returns no recurrence for an unrecognized frequency', () => {
  expect(parseRrule('RRULE:FREQ=SECONDLY')).toEqual(EMPTY_RECURRENCE)
})

it('returns no recurrence when the FREQ key is missing entirely', () => {
  expect(parseRrule('RRULE:INTERVAL=2')).toEqual(EMPTY_RECURRENCE)
})

it('defaults the interval to 1 when INTERVAL is missing', () => {
  expect(parseRrule('RRULE:FREQ=WEEKLY')).toEqual({
    frequency: 'weekly',
    interval: 1,
    weekdays: [],
    end: { type: 'never' },
  })
})

it('parses an UNTIL end back into a RecurrenceState', () => {
  expect(parseRrule('RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20261231T235959Z')).toEqual({
    frequency: 'monthly',
    interval: 1,
    weekdays: [],
    end: { type: 'until', date: '2026-12-31' },
  })
})
