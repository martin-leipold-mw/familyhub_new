import { useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { SectionCard } from '@/features/settings/SectionCard'
import { useGoogleConnections, useDisconnectConnectionMutation } from '@/features/google/useGoogleConnections'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { MemberPickerDialog } from '@/features/google/MemberPickerDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { MEMBER_COLORS, type MemberColor } from '@/features/members/colors'

export function GoogleAccountsSettings() {
  const { connections, isLoading, isError } = useGoogleConnections()
  const { members } = useMembers()
  const disconnectMutation = useDisconnectConnectionMutation()
  const startAuth = useStartGoogleAuth()
  const [picking, setPicking] = useState(false)

  async function handleConnect(memberId: string) {
    // Return to the settings page after the OAuth round-trip, not the calendar start page.
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings', memberId })
    window.location.href = authUrl
  }

  async function handleReconnect(memberId: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/settings', memberId })
    window.location.href = authUrl
  }

  async function handleDisconnect(id: string) {
    await disconnectMutation.mutateAsync({ id })
  }

  if (isLoading) {
    return (
      <SectionCard title="Google-Konten">
        <p className="text-muted">Wird geladen…</p>
      </SectionCard>
    )
  }

  if (isError) {
    return (
      <SectionCard title="Google-Konten">
        <p className="text-danger">Fehler beim Laden der Konten.</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Google-Konten" action={{ label: 'Google-Konto verbinden', onClick: () => setPicking(true) }}>
      {connections.length === 0 ? (
        <p className="text-muted">Noch kein Google-Konto verbunden.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {connections.map((connection) => {
            const isRevoked = connection.status.toLowerCase() === 'revoked'
            const member = members.find((m) => m.id === connection.memberId)
            const ring = member
              ? MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
              : MEMBER_COLORS.blue
            const initial = (member?.name ?? connection.name).charAt(0).toUpperCase()
            return (
              <li key={connection.connectionId} className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-surface-2 flex-shrink-0"
                  style={{ boxShadow: `0 0 0 3px ${ring}` }}
                >
                  {member?.avatarUrl ? (
                    <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary">{initial}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-primary font-medium truncate">
                    {connection.name} ({connection.email})
                  </p>
                  {isRevoked ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-danger text-sm">Verbindung abgelaufen</span>
                      <button
                        type="button"
                        onClick={() => handleReconnect(connection.memberId)}
                        className="inline-flex items-center gap-1 rounded-xl bg-warn-weak text-warn px-3 min-h-[44px]"
                      >
                        <RefreshCw aria-hidden className="w-4 h-4" /> Neu verbinden
                      </button>
                    </div>
                  ) : (
                    <span className="text-accent text-sm">Verbunden</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`${connection.name} trennen`}
                  onClick={() => handleDisconnect(connection.connectionId)}
                  className="flex items-center justify-center rounded-xl text-danger min-h-[44px] min-w-[44px] flex-shrink-0"
                >
                  <Trash2 aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {picking && (
        <MemberPickerDialog
          members={members}
          onSelect={(id) => {
            setPicking(false)
            void handleConnect(id)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </SectionCard>
  )
}
