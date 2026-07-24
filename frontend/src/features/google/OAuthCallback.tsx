import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useGoogleCallback } from '@/api/generated/endpoints/familyHubAPI'

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const error = searchParams.get('error')
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const mutation = useGoogleCallback()
  const firedRef = useRef(false)

  useEffect(() => {
    if (error || !code || !state) return
    // v8 ignore next — StrictMode double-fire guard; the ref is set to true on first call
    if (firedRef.current) return
    firedRef.current = true
    mutation.mutateAsync({ data: { code, state } })
  // mutation is stable across renders; omitting it avoids StrictMode double-fire
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, code, state])

  useEffect(() => {
    if (!mutation.isSuccess) return
    const response = mutation.data?.data
    const target = response?.returnUrl || '/'
    const id = window.setTimeout(() => {
      void navigate(target)
    }, 1500)
    return () => window.clearTimeout(id)
  }, [mutation.isSuccess, mutation.data, navigate])

  // Error param: user denied or Google error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-slate-900 text-white text-center px-4">
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
  if (mutation.isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-slate-900 text-white text-center px-4">
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
  if (mutation.isSuccess) {
    const memberName = mutation.data?.data?.memberName ?? ''
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-slate-900 text-white text-center px-4">
        <p className="text-xl font-bold">Erfolgreich verbunden!</p>
        <p className="text-lg">Willkommen, {memberName}!</p>
      </div>
    )
  }

  // Pending / loading
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-slate-900 text-white text-center px-4">
      <p className="text-xl">Verbinde mit Google…</p>
    </div>
  )
}
