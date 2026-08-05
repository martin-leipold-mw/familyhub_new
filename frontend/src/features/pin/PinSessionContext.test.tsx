import { vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { PinSessionProvider, usePinSession, PIN_SESSION_TIMEOUT_MS } from './PinSessionContext'
import { getSessionToken, notifyActivity, setSessionToken, notifySessionExpired } from '@/api/sessionTokenStore'

function Probe() {
  const { sessionToken, hasPinSession, setSession, clearSession } = usePinSession()
  return (
    <div>
      <span data-testid="token">{sessionToken ?? 'none'}</span>
      <span data-testid="has">{String(hasPinSession)}</span>
      <button onClick={() => setSession('tok-42')}>set</button>
      <button onClick={clearSession}>clear</button>
    </div>
  )
}

describe('PinSessionContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    setSessionToken(null)
  })
  afterEach(() => vi.useRealTimers())

  it('throws when used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PinSessionProvider/)
    spy.mockRestore()
  })

  it('sets and clears the session and mirrors it into the store', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    expect(screen.getByTestId('has').textContent).toBe('false')

    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('token').textContent).toBe('tok-42')
    expect(sessionStorage.getItem('familyhub.pinSession')).toBe('tok-42')
    expect(getSessionToken()).toBe('tok-42')

    fireEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('has').textContent).toBe('false')
    expect(getSessionToken()).toBeNull()
  })

  it('clears the session after 15 minutes of inactivity', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS) })
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('activity re-arms the timer', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS - 1000) })
    act(() => { notifyActivity() })
    act(() => { vi.advanceTimersByTime(PIN_SESSION_TIMEOUT_MS - 1000) })
    expect(screen.getByTestId('token').textContent).toBe('tok-42')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('token').textContent).toBe('none')
  })

  it('restores a token from sessionStorage on mount', () => {
    sessionStorage.setItem('familyhub.pinSession', 'persisted')
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    expect(screen.getByTestId('token').textContent).toBe('persisted')
  })

  it('clears the session when a session-expired signal fires', () => {
    render(<PinSessionProvider><Probe /></PinSessionProvider>)
    fireEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('has').textContent).toBe('true')
    act(() => { notifySessionExpired() })
    expect(screen.getByTestId('has').textContent).toBe('false')
    expect(getSessionToken()).toBeNull()
  })

  it('stops reacting to the signal after unmount', () => {
    const { unmount } = render(<PinSessionProvider><Probe /></PinSessionProvider>)
    unmount()
    // No provider mounted → must not throw when the signal fires.
    act(() => { notifySessionExpired() })
  })
})
