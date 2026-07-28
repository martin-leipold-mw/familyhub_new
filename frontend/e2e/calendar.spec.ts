import { test, expect } from '@playwright/test'

type Event = {
  id: string
  title: string
  memberId: string
  calendarId: string
  isAllDay: boolean
  start?: string
  end?: string
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
