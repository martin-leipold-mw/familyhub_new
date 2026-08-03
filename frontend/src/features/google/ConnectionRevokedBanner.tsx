import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'

/**
 * Global banner shown on every screen when any Google connection is revoked.
 * The reconnect button re-runs the same OAuth authorize flow used in
 * Settings, returning the user to the screen they were on. No PIN gate:
 * the Google consent screen is the safeguard.
 */
export function ConnectionRevokedBanner() {
  const { connections } = useGoogleConnections()
  const startAuth = useStartGoogleAuth()

  const hasRevoked = connections.some((c) => c.status.toLowerCase() === 'revoked')
  if (!hasRevoked) return null

  async function handleReconnect() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: window.location.pathname })
    window.location.href = authUrl
  }

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-col items-start gap-3 bg-amber-500 px-4 py-3 text-slate-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-lg font-semibold">
        Google-Verbindung abgelaufen. Kalender wird nicht mehr aktualisiert.
      </p>
      <button
        type="button"
        onClick={handleReconnect}
        disabled={startAuth.isPending}
        className="min-h-[44px] self-start rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white disabled:opacity-50 sm:self-auto"
      >
        Neu verbinden
      </button>
    </div>
  )
}
