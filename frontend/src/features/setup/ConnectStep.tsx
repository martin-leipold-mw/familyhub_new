import { useState } from 'react'
import { useStartGoogleAuth } from '@/features/google/useCalendars'
import { useMembers } from '@/features/members/useMembersQuery'
import { MemberPickerDialog } from '@/features/google/MemberPickerDialog'

// `onNext` is intentionally unused: this step redirects to Google via
// window.location.href, and progression is handled by the OAuth callback +
// wizard resume when the user returns. The prop is kept for interface uniformity.
export function ConnectStep({ onNext: _onNext }: { onNext: () => void }) {
  const startAuth = useStartGoogleAuth()
  const { members } = useMembers()
  const [picking, setPicking] = useState(false)

  async function connect(memberId?: string) {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/setup', memberId })
    window.location.href = authUrl
  }

  function handleClick() {
    // With members present, attach to a chosen one; with none, fall back to auto-create.
    if (members.length === 0) void connect()
    else setPicking(true)
  }

  return (
    <div className="flex flex-col gap-6 text-white text-center">
      <h1 className="text-2xl font-bold">Mit Google verbinden</h1>
      <p className="text-slate-300">
        Du wirst jetzt zu Google weitergeleitet, um FamilyHub den Zugriff auf deinen Kalender zu
        erlauben. Nach der Bestätigung kehrst du automatisch hierher zurück.
      </p>
      <button
        type="button"
        onClick={handleClick}
        className="mx-auto min-h-[44px] rounded-xl bg-blue-500 px-6 py-3 text-white"
      >
        Mit Google verbinden
      </button>
      {picking && (
        <MemberPickerDialog
          members={members}
          onSelect={(id) => {
            setPicking(false)
            void connect(id)
          }}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  )
}
