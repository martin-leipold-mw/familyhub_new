// MSW handlers for Vitest (Node mode)
// These define the mock API responses used in unit tests.
// Playwright E2E tests use page.route() instead.

export const healthResponse = {
  status: 'UP' as const,
  timestamp: '2026-07-21T10:00:00Z',
  version: 'test',
}
