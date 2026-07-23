import { vi } from 'vitest'
import {
  getSessionToken,
  setSessionToken,
  subscribeSessionToken,
  notifyActivity,
  subscribeActivity,
} from './sessionTokenStore'

describe('sessionTokenStore', () => {
  afterEach(() => setSessionToken(null))

  it('starts empty and stores a token', () => {
    expect(getSessionToken()).toBeNull()
    setSessionToken('abc')
    expect(getSessionToken()).toBe('abc')
  })

  it('notifies token subscribers and unsubscribes', () => {
    const listener = vi.fn()
    const unsub = subscribeSessionToken(listener)
    setSessionToken('x')
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    setSessionToken('y')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies activity subscribers and unsubscribes', () => {
    const listener = vi.fn()
    const unsub = subscribeActivity(listener)
    notifyActivity()
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    notifyActivity()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
