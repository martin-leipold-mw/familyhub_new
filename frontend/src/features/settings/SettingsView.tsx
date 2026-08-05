import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemberResponse } from '@/api/generated/model'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { ChangePinDialog } from './ChangePinDialog'
import { GoogleAccountsSettings } from '@/features/google/GoogleAccountsSettings'
import { CalendarManagement } from '@/features/google/CalendarManagement'
import { PinGate } from '@/features/pin/PinGate'
import { ThemeToggle } from '@/features/theme/ThemeToggle'

export function SettingsView() {
  const { members } = useMembers()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)
  const [changingPin, setChangingPin] = useState(false)

  return (
    <PinGate>
      <div className="min-h-screen bg-bg text-primary p-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-accent min-h-[44px] flex items-center">← Zum Kalender</Link>
            <ThemeToggle />
          </div>
          <h1 className="text-3xl font-bold text-primary">Einstellungen</h1>

          <MemberGrid members={members} onSelect={setEditing} />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-xl bg-surface-2 px-5 py-3 min-h-[44px] text-primary"
            >
              Mitglied hinzufügen
            </button>
            <button
              type="button"
              onClick={() => setChangingPin(true)}
              className="rounded-xl bg-surface-2 px-5 py-3 min-h-[44px] text-primary"
            >
              PIN ändern
            </button>
          </div>

          <GoogleAccountsSettings />
          <CalendarManagement />
        </div>
      </div>

      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
      {changingPin && <ChangePinDialog onClose={() => setChangingPin(false)} />}
    </PinGate>
  )
}
