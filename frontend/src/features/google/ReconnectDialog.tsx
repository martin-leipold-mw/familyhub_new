import { useStartGoogleAuth } from '@/features/google/useCalendars'

/**
 * In-app dialog for re-authorizing one expired Google connection. Reuses the
 * existing full-page OAuth redirect (same flow as Settings); no PIN gate — the
 * Google consent screen is the safeguard.
 */
export function ReconnectDialog({
  name,
  email,
  onClose,
}: {
  name: string
  email: string
  onClose: () => void
}) {
  const startAuth = useStartGoogleAuth()

  async function handleSignIn() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: window.location.pathname })
    window.location.href = authUrl
  }

  return (
    <div
      role="dialog"
      aria-label="Verbindung abgelaufen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-slate-800 p-6 text-white">
        <h2 className="text-xl font-semibold">Verbindung abgelaufen</h2>
        <div>
          <p className="text-lg font-medium">{name}</p>
          <p className="text-slate-300">{email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={startAuth.isPending}
          className="min-h-[44px] rounded-xl bg-amber-500 px-5 py-2 font-semibold text-slate-900 disabled:opacity-50"
        >
          Bei Google anmelden
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-xl bg-slate-700 px-5 py-2 font-semibold text-white"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
