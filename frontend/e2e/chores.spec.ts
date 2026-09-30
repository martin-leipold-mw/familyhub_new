import { test, expect, type Page } from '@playwright/test'

type Chore = {
  id: string
  name: string
  icon: string
  description?: string | null
  intervalDays: number
  assignmentGroup: 'parents' | 'children' | 'all'
  points: number
  isActive: boolean
  nextDueOn: string
  openAssignment?: { id: string; memberId: string; memberName: string; assignedOn: string } | null
}

type Assignment = {
  id: string
  choreId: string
  memberId: string
  name: string
  icon: string
  description?: string | null
  status: 'open' | 'completed'
  points: number
  assignedOn: string
  completedAt?: string | null
}

const MEMBER = { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' }
// Dasselbe Datum wie die App (Browser-Ortszeit), sonst wird "seit heute" zur Zeitbombe.
const TODAY = new Date().toLocaleDateString('sv-SE')

async function stubShell(page: Page) {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: true, currentStep: 7, hasFamilyMembers: true, hasPin: true }),
    }),
  )

  await page.route('**/api/v1/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MEMBER]) }),
  )

  await page.route('**/api/v1/google/connections', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  await page.route('**/api/v1/settings/verify-pin', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessionToken: '11111111-1111-1111-1111-111111111111' }),
    }),
  )
}

/**
 * Bildet den Ausgabelauf nach: eine neu angelegte Vorlage bekommt sofort eine
 * offene Zuweisung beim einzigen Mitglied — genau das Verhalten, das der Sprint
 * zusichert.
 */
async function stubChores(page: Page, chores: Chore[], assignments: Assignment[]) {
  let next = 1

  await page.route(/\/api\/v1\/chores(\?.*)?$/, (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chores) })
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      const id = `c${next}`
      const assignmentId = `a${next}`
      next += 1
      const created: Chore = {
        id,
        points: 10,
        isActive: true,
        nextDueOn: TODAY,
        ...body,
        openAssignment: { id: assignmentId, memberId: MEMBER.id, memberName: MEMBER.name, assignedOn: TODAY },
      }
      chores.push(created)
      assignments.push({
        id: assignmentId,
        choreId: id,
        memberId: MEMBER.id,
        name: created.name,
        icon: created.icon,
        description: created.description ?? null,
        status: 'open',
        points: created.points,
        assignedOn: TODAY,
      })
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    return route.fallback()
  })

  await page.route(/\/api\/v1\/chore-assignments$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assignments) }),
  )

  await page.route(/\/api\/v1\/chore-assignments\/([^/]+)\/(complete|undo)$/, (route) => {
    const parts = route.request().url().split('/')
    const action = parts.pop()!
    const id = parts.pop()!
    const found = assignments.find((a) => a.id === id)!
    if (action === 'complete') {
      found.status = 'completed'
      found.completedAt = new Date().toISOString()
    } else {
      found.status = 'open'
      found.completedAt = null
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
  })
}

async function enterPin(page: Page) {
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Bestätigen' }).click()
}

test('legt eine Aufgabe an und sieht sie sofort in der Lane', async ({ page }) => {
  const chores: Chore[] = []
  const assignments: Assignment[] = []
  await stubShell(page)
  await stubChores(page, chores, assignments)

  await page.goto('/settings')
  await enterPin(page)

  await page.getByRole('link', { name: /Haushalt ·/ }).click()
  await expect(page).toHaveURL(/\/settings\/chores$/)

  await page.getByRole('button', { name: 'Neue Aufgabe' }).click()
  await page.getByLabel('Name').fill('Tisch decken')
  await page.getByRole('button', { name: 'Symbol 🍽️' }).click()
  await page.getByRole('button', { name: 'Täglich' }).click()
  await page.getByRole('button', { name: 'Speichern' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Offen bei Anna · seit heute')).toBeVisible()

  await page.getByRole('link', { name: 'Haushalt' }).first().click()
  await expect(page).toHaveURL(/\/chores$/)
  await expect(page.getByText('Anna')).toBeVisible()
  await expect(page.getByText('Tisch decken')).toBeVisible()
  await expect(page.getByText('1 offen')).toBeVisible()
})

test('hakt eine Aufgabe ab und nimmt es zurueck', async ({ page }) => {
  const chores: Chore[] = []
  const assignments: Assignment[] = [
    {
      id: 'a1',
      choreId: 'c1',
      memberId: 'm1',
      name: 'Müll rausbringen',
      icon: '🗑️',
      status: 'open',
      points: 10,
      assignedOn: TODAY,
    },
  ]
  await stubShell(page)
  await stubChores(page, chores, assignments)

  await page.goto('/chores')

  await page.getByRole('button', { name: 'Müll rausbringen erledigt' }).click()
  await expect(page.getByText('Müll rausbringen')).toHaveClass(/line-through/)
  await expect(page.getByText('Alles erledigt! 🎉')).toBeVisible()

  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.getByText('1 offen')).toBeVisible()
})

test('zeigt eine leere Lane als Alles erledigt', async ({ page }) => {
  await stubShell(page)
  await stubChores(page, [], [])

  await page.goto('/chores')

  await expect(page.getByText('Alles erledigt! 🎉')).toBeVisible()
})
