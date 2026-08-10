import type { ConnectionResponse } from '@/api/generated/model'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { connectionsMissingTasksScope } from './tasksScope'

/**
 * Warnt sichtbar, wenn eine Google-Verbindung vor der Einführung des
 * Tasks-Scopes autorisiert wurde und daher beim Sync stillschweigend
 * übersprungen wird (siehe TaskSyncService.syncConnection). Nutzt denselben
 * OAuth-Redirect wie GoogleAccountsSettings.tsx.
 */
export function TasksScopeNotice({ connections }: { connections: ConnectionResponse[] }) {
  const startAuth = useStartGoogleAuth()
  const affected = connectionsMissingTasksScope(connections)

  async function handleReconnect(memberId: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/tasks', memberId })
    window.location.href = authUrl
  }

  if (affected.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {affected.map((connection) => (
        <div
          key={connection.connectionId}
          className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-weak p-3"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-warn">{connection.name}</p>
            <p className="text-warn">Für Aufgaben braucht dieses Konto eine erweiterte Google-Berechtigung.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleReconnect(connection.memberId)}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-warn-weak px-3 text-warn"
          >
            Konto neu verbinden
          </button>
        </div>
      ))}
    </div>
  )
}
