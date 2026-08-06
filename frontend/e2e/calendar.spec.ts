import { test, expect } from '@playwright/test'
import { startOfWeek, addDays, format as formatDate } from 'date-fns'

type Event = {
  id: string
  title: string
  memberId: string
  calendarId: string
  isAllDay: boolean
  start?: string
  end?: string
  recurringEventId?: string | null
  recurrenceRule?: string | null
}

test('create, edit and delete a calendar event', async ({ page }) => {
  const events: Event[] = []
  let nextId = 1

  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
      ]),
    }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // list + create events
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const created: Event = { id: String(nextId++), calendarId: 'c1', ...body }
      events.push(created)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  // update + delete events
  await page.route(/\/api\/v1\/events\/[^/?]+$/, (route) => {
    const req = route.request()
    const id = req.url().split('/').pop()!.split('?')[0]
    const idx = events.findIndex((e) => e.id === id)
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() ?? '{}')
      if (idx >= 0) events[idx] = { ...events[idx], ...body }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events[idx]) })
    }
    if (req.method() === 'DELETE') {
      if (idx >= 0) events.splice(idx, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })

  await page.goto('/')

  // Create: open dialog via an empty slot
  await page.getByLabel('Neuer Termin 08:00').first().click()
  await page.getByLabel('Titel').fill('Zahnarzt')
  await page.getByRole('button', { name: 'Anna' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Visible in the grid
  await expect(page.getByRole('button', { name: /Zahnarzt/ })).toBeVisible()

  // Edit
  await page.getByRole('button', { name: /Zahnarzt/ }).click()
  await page.getByLabel('Titel').fill('Zahnarzt Kontrolle')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('button', { name: /Zahnarzt Kontrolle/ })).toBeVisible()

  // Delete (two-step confirm)
  await page.getByRole('button', { name: /Zahnarzt Kontrolle/ }).click()
  await page.getByRole('button', { name: 'Löschen' }).click()
  await page.getByRole('button', { name: 'Wirklich löschen' }).click()
  await expect(page.getByRole('button', { name: /Zahnarzt/ })).toHaveCount(0)
})

test('create a recurring weekly event, see the series badge, then delete the whole series', async ({ page }) => {
  const events: Event[] = []
  let nextId = 1
  let nextSeriesId = 1

  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
      ]),
    }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // list + create events
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const created: Event = { id: String(nextId++), calendarId: 'c1', ...body }
      if (body.recurrenceRule) {
        created.recurringEventId = `series-${nextSeriesId++}`
      }
      events.push(created)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  // series lookup (fetched when the edit dialog switches scope to "Ganze Serie")
  await page.route(/\/api\/v1\/events\/[^/?]+\/series$/, (route) => {
    const parts = new URL(route.request().url()).pathname.split('/')
    const id = parts[parts.length - 2]
    const found = events.find((e) => e.id === id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
  })

  // update + delete a single event (allow an optional ?scope=... query)
  await page.route(/\/api\/v1\/events\/[^/?]+(\?.*)?$/, (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const id = url.pathname.split('/').pop()!
    const scope = url.searchParams.get('scope')
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() ?? '{}')
      const idx = events.findIndex((e) => e.id === id)
      if (idx >= 0) events[idx] = { ...events[idx], ...body }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(events[idx]) })
    }
    if (req.method() === 'DELETE') {
      if (scope === 'series') {
        const seriesId = events.find((e) => e.id === id)?.recurringEventId
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].recurringEventId === seriesId) events.splice(i, 1)
        }
      } else {
        const idx = events.findIndex((e) => e.id === id)
        if (idx >= 0) events.splice(idx, 1)
      }
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })

  await page.goto('/')

  // Create: weekly recurring event via an empty slot
  await page.getByLabel('Neuer Termin 08:00').first().click()
  await page.getByLabel('Titel').fill('Sport')
  await page.getByRole('button', { name: 'Anna' }).click()
  await page.getByLabel('Wiederholung').selectOption('weekly')
  await page.getByRole('button', { name: 'Speichern' }).click()

  // Visible with the 🔁 series marker
  await expect(page.getByRole('button', { name: /Sport/ })).toBeVisible()
  await expect(page.locator('[aria-label="Serie"]')).toBeVisible()

  // Open it, choose "Ganze Serie", delete
  await page.getByRole('button', { name: /Sport/ }).click()
  await page.getByLabel('Ganze Serie').check()
  await page.getByRole('button', { name: 'Löschen' }).click()
  await page.getByRole('button', { name: 'Wirklich löschen' }).click()

  // Gone from the view
  await expect(page.getByRole('button', { name: /Sport/ })).toHaveCount(0)
  await expect(page.locator('[aria-label="Serie"]')).toHaveCount(0)
})

test('events are colored per assigned member across two accounts (FA-KAL-06), not by calendar color', async ({ page }) => {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )
  await page.route('**/api/v1/members', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'm1', name: 'Anna', role: 'parent', color: 'green', isActive: true, createdAt: '', updatedAt: '' },
        { id: 'm2', name: 'Ben', role: 'parent', color: 'blue', isActive: true, createdAt: '', updatedAt: '' },
      ]),
    }),
  )
  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  // Aggregate calendars carry distinct `color` fields (green/blue/amber) — these are
  // deliberate distractors: per FA-KAL-06 the UI must ignore them and color by member.
  await page.route('**/api/v1/google/calendars/all', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'cal-anna', summary: 'Anna', isPrimary: true, isSelected: true, color: 'hsl(140 60% 65%)', isShared: false, isWriteTarget: true, ownerMemberId: 'm1' },
        { id: 'cal-ben', summary: 'Ben', isPrimary: true, isSelected: true, color: 'hsl(210 80% 70%)', isShared: false, isWriteTarget: true, ownerMemberId: 'm2' },
        { id: 'cal-shared', summary: 'Feiertage', isPrimary: false, isSelected: true, color: 'hsl(45 90% 55%)', isShared: true, isWriteTarget: false, ownerMemberId: 'm1' },
      ]),
    }),
  )

  // The app opens on the real current week (no clock freeze in this spec); pick the
  // Wednesday of that week — same Monday-start week math the app uses (dates.ts:weekDays)
  // — so the fixture events always land inside the visible grid regardless of run date.
  const day = formatDate(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 2), 'yyyy-MM-dd')
  await page.route(/\/api\/v1\/events(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', title: 'Anna Termin', memberId: 'm1', calendarId: 'cal-anna', isAllDay: false, start: `${day}T09:00:00Z`, end: `${day}T10:00:00Z` },
        { id: '2', title: 'Ben Termin', memberId: 'm2', calendarId: 'cal-ben', isAllDay: false, start: `${day}T11:00:00Z`, end: `${day}T12:00:00Z` },
        { id: '3', title: 'Feiertag', memberId: 'm1', calendarId: 'cal-shared', isAllDay: false, start: `${day}T13:00:00Z`, end: `${day}T14:00:00Z` },
      ]),
    })
  })

  await page.goto('/')

  const anna = page.getByRole('button', { name: /Anna Termin/ })
  const ben = page.getByRole('button', { name: /Ben Termin/ })
  const shared = page.getByRole('button', { name: /Feiertag/ })

  await expect(anna).toBeVisible()
  await expect(ben).toBeVisible()
  await expect(shared).toBeVisible()

  const colorOf = (loc: typeof anna) => loc.evaluate((el) => getComputedStyle(el).backgroundColor)
  const [cAnna, cBen, cShared] = await Promise.all([colorOf(anna), colorOf(ben), colorOf(shared)])

  // FA-KAL-06: events are colored by the assigned family member, NOT by the calendar's
  // own color. Anna (m1) and Ben (m2) are different members → two distinct colors.
  expect(new Set([cAnna, cBen]).size).toBe(2)
  // The shared "Feiertag" event is assigned to m1 (Anna), so it takes Anna's member
  // color — it must NOT pick up the calendar's amber `color` field.
  expect(cShared).toBe(cAnna)
})
