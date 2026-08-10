import { describe, it, expect } from 'vitest'
import type { ConnectionResponse } from '@/api/generated/model'
import { TASKS_SCOPE, hasTasksScope, connectionsMissingTasksScope } from './tasksScope'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

function connection(overrides: Partial<ConnectionResponse> & { connectionId: string }): ConnectionResponse {
  return {
    connectionId: overrides.connectionId,
    memberId: overrides.memberId ?? 'mem-1',
    email: overrides.email ?? 'anna@gmail.com',
    name: overrides.name ?? 'Anna',
    status: overrides.status ?? 'ACTIVE',
    lastSyncedAt: overrides.lastSyncedAt ?? null,
    scopes: overrides.scopes ?? [],
  }
}

describe('hasTasksScope', () => {
  it('reports true when the tasks scope is present', () => {
    const c = connection({ connectionId: 'conn-1', scopes: [CALENDAR_SCOPE, TASKS_SCOPE] })
    expect(hasTasksScope(c)).toBe(true)
  })

  it('reports false when only the calendar scope is present', () => {
    const c = connection({ connectionId: 'conn-1', scopes: [CALENDAR_SCOPE] })
    expect(hasTasksScope(c)).toBe(false)
  })

  it('reports false for an empty scope list', () => {
    const c = connection({ connectionId: 'conn-1', scopes: [] })
    expect(hasTasksScope(c)).toBe(false)
  })
})

describe('connectionsMissingTasksScope', () => {
  it('returns every connection missing the scope', () => {
    const withScope = connection({ connectionId: 'conn-1', scopes: [TASKS_SCOPE] })
    const withoutScope = connection({ connectionId: 'conn-2', scopes: [CALENDAR_SCOPE] })
    expect(connectionsMissingTasksScope([withScope, withoutScope])).toEqual([withoutScope])
  })

  it('returns an empty array when all connections have the scope', () => {
    const a = connection({ connectionId: 'conn-1', scopes: [TASKS_SCOPE] })
    const b = connection({ connectionId: 'conn-2', scopes: [TASKS_SCOPE] })
    expect(connectionsMissingTasksScope([a, b])).toEqual([])
  })

  it('excludes a revoked connection even though it also lacks the scope', () => {
    // Revoked connections already get their own reconnect affordance
    // (RevokedConnectionSnackbars); showing the scope notice too would give the
    // user two competing prompts for the same connection.
    const revoked = connection({ connectionId: 'conn-1', status: 'REVOKED', scopes: [] })
    expect(connectionsMissingTasksScope([revoked])).toEqual([])
  })

  it('excludes a revoked connection regardless of status casing', () => {
    const revoked = connection({ connectionId: 'conn-1', status: 'revoked', scopes: [] })
    expect(connectionsMissingTasksScope([revoked])).toEqual([])
  })

  it('still returns a non-revoked connection missing the scope', () => {
    const active = connection({ connectionId: 'conn-1', status: 'ACTIVE', scopes: [] })
    expect(connectionsMissingTasksScope([active])).toEqual([active])
  })
})
