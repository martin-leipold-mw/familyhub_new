import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { setSessionToken, subscribeActivity, subscribeSessionExpired } from '@/api/sessionTokenStore'

export const PIN_SESSION_STORAGE_KEY = 'familyhub.pinSession'
export const PIN_SESSION_TIMEOUT_MS = 15 * 60 * 1000

interface PinSessionValue {
  sessionToken: string | null
  hasPinSession: boolean
  setSession: (token: string) => void
  clearSession: () => void
}

const PinSessionContext = createContext<PinSessionValue | null>(null)

export function PinSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(PIN_SESSION_STORAGE_KEY),
  )
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setSessionToken(token)
  }, [token])

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(PIN_SESSION_STORAGE_KEY)
    setToken(null)
  }, [])

  const setSession = useCallback((newToken: string) => {
    sessionStorage.setItem(PIN_SESSION_STORAGE_KEY, newToken)
    setToken(newToken)
  }, [])

  useEffect(() => subscribeSessionExpired(clearSession), [clearSession])

  useEffect(() => {
    if (!token) return
    const arm = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(clearSession, PIN_SESSION_TIMEOUT_MS)
    }
    arm()
    const unsubscribe = subscribeActivity(arm)
    return () => {
      unsubscribe()
      // v8 ignore next — timerRef.current is always non-null here since arm() runs first
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [token, clearSession])

  return (
    <PinSessionContext.Provider
      value={{ sessionToken: token, hasPinSession: token !== null, setSession, clearSession }}
    >
      {children}
    </PinSessionContext.Provider>
  )
}

export function usePinSession(): PinSessionValue {
  const ctx = useContext(PinSessionContext)
  if (!ctx) throw new Error('usePinSession must be used within a PinSessionProvider')
  return ctx
}
