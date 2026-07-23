import { vi } from 'vitest'
import { customFetch } from './customFetch'
import { setSessionToken, subscribeActivity } from './sessionTokenStore'

function mockFetch(status = 200, body: unknown = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => body,
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
})
