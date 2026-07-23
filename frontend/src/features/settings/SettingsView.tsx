import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from '@/features/pin/PinInputDialog'
import { ChangePinDialog } from './ChangePinDialog'

export function SettingsView() {
  const { members } = useMembers()
  const { hasPinSession, setSession } = usePinSession()
  const verifyPin = useVerifyPin()

  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)
  const [changingPin, setChangingPin] = useState(false)

  async function unlock(pin: string) {
    setUnlockError(null)
    try {
      const result = await verifyPin.mutateAsync({ data: { pin } })
      setSession(result.data.sessionToken)
      setUnlocking(false)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Falsche PIN.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-white">Einstellungen</h1>

        <MemberGrid members={members} onSelect={hasPinSession ? setEditing : undefined} />

        {hasPinSession ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-xl bg-slate-700 px-5 py-3 min-h-[44px] text-white"
            >
              Mitglied hinzufügen
            </button>
            <button
              type="button"
              onClick={() => setChangingPin(true)}
              className="rounded-xl bg-slate-700 px-5 py-3 min-h-[44px] text-white"
            >
              PIN ändern
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setUnlocking(true)}
            className="self-start rounded-xl bg-blue-500 px-5 py-3 min-h-[44px] text-white"
          >
            Zum Bearbeiten entsperren
          </button>
        )}
      </div>

      {unlocking && (
        <PinInputDialog
          title="PIN eingeben"
          error={unlockError}
          onSubmit={unlock}
          onCancel={() => { setUnlocking(false); setUnlockError(null) }}
        />
      )}
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
      {changingPin && <ChangePinDialog onClose={() => setChangingPin(false)} />}
    </div>
  )
}
