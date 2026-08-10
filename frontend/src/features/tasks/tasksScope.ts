import type { ConnectionResponse } from '@/api/generated/model'

/** Muss mit TASKS_SCOPE in backend/.../google/oauth/GoogleOAuthFlow.kt übereinstimmen. */
export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'

export function hasTasksScope(connection: ConnectionResponse): boolean {
  return connection.scopes.includes(TASKS_SCOPE)
}

export function connectionsMissingTasksScope(connections: ConnectionResponse[]): ConnectionResponse[] {
  return connections.filter((c) => !hasTasksScope(c))
}
