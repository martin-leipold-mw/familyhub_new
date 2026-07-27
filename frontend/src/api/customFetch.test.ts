import { vi } from 'vitest'
import { customFetch } from './customFetch'
import { setSessionToken, subscribeActivity } from './sessionTokenStore'

function mockFetch(status = 200, body: unknown = { ok: true }, jsonRejects = false) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: `STATUS_${status}`,
    headers: new Headers(),
    json: jsonRejects
      ? () => Promise.reject(new Error('not JSON'))
      : async () => body,
    // Mirror real fetch: an empty body yields '' (and .json() would reject).
    // Pass `null` as body to simulate an empty response (explicit `undefined`
    // would trigger the parameter default instead).
    text: async () => (body == null ? '' : JSON.stringify(body)),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('customFetch', () => {
  afterEach(() => {
    setSessionToken(null)
    vi.unstubAllGlobals()
  })

  it('omits X-Pin-Session when no token', async () => {
    const fetchMock = mockFetch()
    await customFetch('/api/v1/members')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['X-Pin-Session']).toBeUndefined()
  })

  it('adds X-Pin-Session when a token is set', async () => {
    const fetchMock = mockFetch()
    setSessionToken('tok-1')
    await customFetch('/api/v1/members')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['X-Pin-Session']).toBe('tok-1')
  })

  it('lets option headers override the default content-type', async () => {
    const fetchMock = mockFetch()
    await customFetch('/api/v1/members/1/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
    })
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('image/jpeg')
  })

  it('throws with the server message on error', async () => {
    mockFetch(413, { message: 'Das Bild ist zu groß für den Server' })
    await expect(customFetch('/api/v1/members/1/avatar', { method: 'PUT' }))
      .rejects.toThrow('Das Bild ist zu groß für den Server')
  })

  it('signals activity on every request', async () => {
    mockFetch()
    const listener = vi.fn()
    const unsub = subscribeActivity(listener)
    await customFetch('/api/v1/members')
    expect(listener).toHaveBeenCalled()
    unsub()
  })

  it('returns status 204 with undefined data for 204 No Content', async () => {
    mockFetch(204)
    const result = await customFetch<{ data: undefined; status: 204 }>('/api/v1/members/1')
    expect(result.status).toBe(204)
    expect(result.data).toBeUndefined()
  })

  it('returns undefined data for a 200 with an empty body (no-content operation)', async () => {
    // saveSelectedCalendars/disconnect/refresh are declared 200-without-content in the
    // OpenAPI spec, so the server sends 200 with an empty body. Real fetch .json() rejects
    // on that ("Unexpected end of JSON input"); jsonRejects=true reproduces it.
    mockFetch(200, null, true)
    const result = await customFetch<{ data: undefined; status: number }>(
      '/api/v1/google/calendars/selected',
      { method: 'PUT' },
    )
    expect(result.status).toBe(200)
    expect(result.data).toBeUndefined()
  })

  it('throws with statusText when response.json() rejects on error response', async () => {
    mockFetch(500, {}, true)
    await expect(customFetch('/api/v1/members')).rejects.toThrow('STATUS_500')
  })

  it('throws HTTP <status> when error body has no message field', async () => {
    mockFetch(404, { code: 'NOT_FOUND' })
    await expect(customFetch('/api/v1/members/999')).rejects.toThrow('HTTP 404')
  })
})
