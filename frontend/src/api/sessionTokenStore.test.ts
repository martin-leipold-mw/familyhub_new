import { vi } from 'vitest'
import { notifySessionExpired, subscribeSessionExpired } from './sessionTokenStore'

describe('sessionTokenStore session-expired signal', () => {
  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsub = subscribeSessionExpired(listener)
    notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    notifySessionExpired()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
