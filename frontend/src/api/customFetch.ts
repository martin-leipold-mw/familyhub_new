import { getSessionToken, notifyActivity } from './sessionTokenStore'

export async function customFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  notifyActivity()
  const sessionToken = getSessionToken()

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Pin-Session': sessionToken } : {}),
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message ?? `HTTP ${response.status}`)
  }

  if (response.status === 204) return { data: undefined, status: 204, headers: response.headers } as T

  // Some operations are declared 200-without-content in the OpenAPI spec (e.g.
  // saveSelectedCalendars, disconnect, refresh); the server then sends an empty body.
  // Reading text first avoids response.json() throwing "Unexpected end of JSON input".
  const body = await response.text()
  const data = body ? JSON.parse(body) : undefined
  return { data, status: response.status, headers: response.headers } as T
}
