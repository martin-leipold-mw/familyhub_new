import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { googleCallback } from '@/api/generated/endpoints/familyHubAPI'
import type { OAuthCallbackResponse } from '@/api/generated/model'

type Status =
  | { phase: 'pending' }
  | { phase: 'success'; data: OAuthCallbackResponse | undefined }
  | { phase: 'error' }

// A Google OAuth authorization code is single-use, so it must be exchanged
// exactly once. React StrictMode mounts this component twice in dev; a
// per-instance ref guard survives that remount but leaves the surviving mount's
// React Query mutation observer idle forever (the first, throwaway mount fires
// the request and its result dies with its detached observer → the UI stays
// stuck on "Verbinde mit Google…"). Keying the in-flight exchange at module
// scope fixes both halves: the code is exchanged once, and whichever mount
// survives awaits the same promise and observes the real result.
const exchanges = new Map<string, Promise<OAuthCallbackResponse>>()

function exchangeCode(code: string, state: string): Promise<OAuthCallbackResponse> {
  const key = `${code}::${state}`
  let promise = exchanges.get(key)
  if (!promise) {
    promise = googleCallback({ code, state }).then((response) => response.data)
    exchanges.set(key, promise)
  }
  return promise
}

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const error = searchParams.get('error')
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const [status, setStatus] = useState<Status>({ phase: 'pending' })

  useEffect(() => {
    if (error || !code || !state) return
    let active = true
    exchangeCode(code, state).then(
      (data) => {
        if (active) setStatus({ phase: 'success', data })
      },
      () => {
        if (active) setStatus({ phase: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [error, code, state])

  useEffect(() => {
    if (status.phase !== 'success') return
    const target = status.data?.returnUrl || '/'
    const id = window.setTimeout(() => {
      void navigate(target)
    }, 1500)
    return () => window.clearTimeout(id)
  }, [status, navigate])

  const containerClass =
    'flex flex-col items-center justify-center min-h-screen gap-6 bg-slate-900 text-white text-center px-4'

  // Error param: user denied or Google error
  if (error) {
    return (
      <div role="status" aria-live="polite" className={containerClass}>
        <p className="text-xl">Google-Authentifizierung wurde abgebrochen.</p>
        <Link
          to="/"
          className="rounded-xl bg-slate-700 px-6 py-3 min-h-[44px] flex items-center text-white"
        >
          Zurück
        </Link>
      </div>
    )
  }

  // Mutation error
  if (status.phase === 'error') {
    return (
      <div role="status" aria-live="polite" className={containerClass}>
        <p className="text-xl">Verbindung fehlgeschlagen.</p>
        <Link
          to="/"
          className="rounded-xl bg-slate-700 px-6 py-3 min-h-[44px] flex items-center text-white"
        >
          Zurück
        </Link>
      </div>
    )
  }

  // Success
  if (status.phase === 'success') {
    const memberName = status.data?.memberName ?? ''
    return (
      <div role="status" aria-live="polite" className={containerClass}>
        <p className="text-xl font-bold">Erfolgreich verbunden!</p>
        <p className="text-lg">{memberName ? `Willkommen, ${memberName}!` : 'Willkommen!'}</p>
      </div>
    )
  }

  // Pending / loading
  return (
    <div role="status" aria-live="polite" className={containerClass}>
      <p className="text-xl">Verbinde mit Google…</p>
    </div>
  )
}
