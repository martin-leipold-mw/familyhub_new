// Test fixtures for the health endpoint.
// Playwright E2E tests use page.route() directly; Vitest tests import these fixtures.

export const healthResponse = {
  status: 'UP' as const,
  timestamp: '2026-07-21T10:00:00Z',
  version: 'test',
}
