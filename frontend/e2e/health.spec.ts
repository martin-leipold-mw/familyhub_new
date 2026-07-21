import { test, expect } from '@playwright/test'

test('zeigt Systemstatus auf der Startseite', async ({ page }) => {
  await page.route('**/api/health', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'UP', timestamp: '2026-07-21T10:00:00Z', version: 'e2e' }),
    }),
  )
  await page.goto('/')
  await expect(page.getByText('FamilyHub')).toBeVisible()
  await expect(page.getByText('System bereit')).toBeVisible()
})
