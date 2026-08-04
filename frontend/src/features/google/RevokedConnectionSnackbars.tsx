import { useEffect, useState } from 'react'
import type { ConnectionResponse } from '@/api/generated/model'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useSnackbar } from '@/routing/SnackbarProvider'
import { ReconnectDialog } from '@/features/google/ReconnectDialog'

/**
 * Watches the polled connection list and shows one deduped snackbar per
 * connection whose token has been revoked. The sync (useCalendarSync) is the
 * detector that flips a dead token to "revoked" server-side and invalidates
 * the connections query; this component only mirrors the resulting list.
 */
export function RevokedConnectionSnackbars() {
  const { connections } = useGoogleConnections()
  const { show, dismiss } = useSnackbar()
  const [target, setTarget] = useState<ConnectionResponse | null>(null)

  useEffect(() => {
    for (const connection of connections) {
      const id = `revoked-${connection.connectionId}`
      if (connection.status.toLowerCase() === 'revoked') {
        show({
          id,
          message: `${connection.name} (${connection.email}): Google-Verbindung abgelaufen. Bitte neu verbinden.`,
          action: { label: 'Neu verbinden', onClick: () => setTarget(connection) },
        })
      } else {
        dismiss(id)
      }
    }
  }, [connections, show, dismiss])

  if (!target) return null
  return <ReconnectDialog name={target.name} email={target.email} onClose={() => setTarget(null)} />
}
