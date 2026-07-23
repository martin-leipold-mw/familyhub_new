import { test, expect } from '@playwright/test'

test('redirects to the setup wizard when setup is incomplete', async ({ page }) => {
  await page.route('**/api/v1/settings/setup-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ setupCompleted: false, currentStep: 1, hasFamilyMembers: false, hasPin: false }),
    }),
  )
  await page.route('**/api/v1/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByText('Willkommen bei FamilyHub')).toBeVisible()
})
