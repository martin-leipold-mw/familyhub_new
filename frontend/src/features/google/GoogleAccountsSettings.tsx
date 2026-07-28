import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { usePinSession } from '@/features/pin/PinSessionContext'

export function GoogleAccountsSettings() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const disconnectMutation = useDisconnectConnectionMutation()
  const startAuth = useStartGoogleAuth()
  const { hasPinSession } = usePinSession()

  async function handleConnect() {
    // Return to the settings page after the OAuth round-trip, not the calendar start page.
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings' })
    window.location.href = authUrl
  }

  async function handleReconnect() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings' })
    window.location.href = authUrl
  }

  async function handleDisconnect(id: string) {
    await disconnectMutation.mutateAsync({ id })
  }

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold text-white mb-4">Google-Konten</h2>
        <p className="text-slate-400">Wird geladen…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold text-white mb-4">Google-Konten</h2>
        <p className="text-red-400">Fehler beim Laden der Konten.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h2 className="text-xl font-semibold text-white mb-4">Google-Konten</h2>

      {connections.length === 0 ? (
        <p className="text-slate-400 mb-4">Noch kein Google-Konto verbunden.</p>
      ) : (
        <ul className="flex flex-col gap-4 mb-4">
          {connections.map((connection) => {
            const isRevoked = connection.status.toLowerCase() === 'revoked'
            return (
              <li key={connection.connectionId} className="flex flex-col gap-2">
                <span className="text-white font-medium">
                  {connection.name} ({connection.email})
                </span>
                {isRevoked ? (
                  <>
                    <span className="text-red-400 text-sm">
                      Verbindung abgelaufen — bitte neu verbinden
                    </span>
                    <button
                      type="button"
                      onClick={handleReconnect}
                      disabled={!hasPinSession}
                      aria-disabled={!hasPinSession}
                      className="self-start rounded-xl bg-yellow-600 px-4 py-2 min-h-[44px] text-white disabled:opacity-50"
                    >
                      Neu verbinden
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-green-400 text-sm">Verbunden</span>
                    {connection.lastSyncedAt && (
                      <span className="text-slate-400 text-sm">
                        Zuletzt synchronisiert: {connection.lastSyncedAt}
                      </span>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleDisconnect(connection.connectionId)}
                  disabled={!hasPinSession}
                  aria-disabled={!hasPinSession}
                  className="self-start rounded-xl bg-red-700 px-4 py-2 min-h-[44px] text-white disabled:opacity-50"
                >
                  Trennen
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!hasPinSession && (
        <p className="text-slate-400 text-sm mb-4">
          Melde dich mit PIN an, um Kalender zu verwalten.
        </p>
      )}

      <button
        type="button"
        onClick={handleConnect}
        disabled={!hasPinSession}
        aria-disabled={!hasPinSession}
        className="rounded-xl bg-blue-500 px-5 py-3 min-h-[44px] text-white disabled:opacity-50"
      >
        Weiteres Konto verbinden
      </button>
    </div>
  )
}
