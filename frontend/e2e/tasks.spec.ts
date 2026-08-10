import { test, expect } from '@playwright/test'

type Task = {
  id: string
  memberId: string
  title: string
  notes?: string | null
  dueDate?: string | null
  status: 'pending' | 'completed'
  priority?: 'low' | 'medium' | 'high' | null
  completedAt?: string | null
}

const MEMBER = { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' }

const CONNECTION = {
  connectionId: 'conn1',
  memberId: 'm1',
  email: 'anna@example.com',
  name: 'Anna',
  status: 'connected',
  lastSyncedAt: null,
  scopes: ['https://www.googleapis.com/auth/tasks'],
}

async function stubShell(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 6, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MEMBER]) }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CONNECTION]) }),
  )
}

async function stubTasks(page: import('@playwright/test').Page, tasks: Task[]) {
  let nextId = tasks.length + 1

  // list + create tasks
  await page.route(/\/api\/v1\/tasks(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const created: Task = { id: String(nextId++), status: 'pending', ...body }
      tasks.push(created)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  // update tasks
  await page.route(/\/api\/v1\/tasks\/[^/?]+$/, (route) => {
    const req = route.request()
    const id = req.url().split('/').pop()!.split('?')[0]
    const idx = tasks.findIndex((t) => t.id === id)
    if (req.method() === 'PATCH') {
      const body = JSON.parse(req.postData() ?? '{}')
      if (idx >= 0) tasks[idx] = { ...tasks[idx], ...body }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks[idx]) })
    }
    if (req.method() === 'DELETE') {
      if (idx >= 0) tasks.splice(idx, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })
}

test('navigates to the tasks section', async ({ page }) => {
  await stubShell(page)
  await stubTasks(page, [])

  await page.goto('/')
  await page.getByRole('link', { name: 'Aufgaben' }).click()

  await expect(page).toHaveURL(/\/tasks$/)
  await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible()
  await expect(page.getByText('Anna')).toBeVisible()
})

test('creates a task and sees it in the list', async ({ page }) => {
  await stubShell(page)
  await stubTasks(page, [])

  await page.goto('/tasks')

  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click()
  await page.getByRole('dialog', { name: 'Neue Aufgabe' }).getByLabel('Aufgabe').fill('Zähne putzen')
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Zähne putzen')).toBeVisible()
})

test('checks a task off and sees it struck through', async ({ page }) => {
  await stubShell(page)
  await stubTasks(page, [{ id: 't1', memberId: 'm1', title: 'Müll rausbringen', status: 'pending' }])

  await page.goto('/tasks')

  // "Alle" statt "Offen", damit die Aufgabe nach dem Abhaken sichtbar bleibt
  // (unter "Offen" verschwindet eine erledigte Aufgabe per Filterlogik).
  await page.getByRole('button', { name: /^Alle/ }).click()

  const checkbox = page.getByRole('button', { name: 'Müll rausbringen', exact: true })
  await checkbox.click()

  await expect(checkbox).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Müll rausbringen')).toHaveClass(/line-through/)
})

test('switches the filter to Erledigt and back to Offen', async ({ page }) => {
  await stubShell(page)
  await stubTasks(page, [
    { id: 't1', memberId: 'm1', title: 'Einkaufen', status: 'pending' },
    { id: 't2', memberId: 'm1', title: 'Rasen mähen', status: 'completed', completedAt: '2026-08-01T10:00:00Z' },
  ])

  await page.goto('/tasks')

  // Standardfilter "Offen": nur die offene Aufgabe ist sichtbar
  await expect(page.getByText('Einkaufen')).toBeVisible()
  await expect(page.getByText('Rasen mähen')).toHaveCount(0)

  await page.getByRole('button', { name: /^Erledigt/ }).click()
  await expect(page.getByText('Rasen mähen')).toBeVisible()
  await expect(page.getByText('Einkaufen')).toHaveCount(0)

  await page.getByRole('button', { name: /^Offen/ }).click()
  await expect(page.getByText('Einkaufen')).toBeVisible()
  await expect(page.getByText('Rasen mähen')).toHaveCount(0)
})
