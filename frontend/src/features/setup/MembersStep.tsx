import { useState } from 'react'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'

export function MembersStep({ onNext }: { onNext: () => void }) {
  const { members } = useMembers()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-6 text-white">
      <h1 className="text-2xl font-bold text-center">Wer gehört zur Familie?</h1>
      <MemberGrid members={members} />
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mx-auto rounded-xl bg-slate-700 px-6 py-3 min-h-[44px] text-white"
      >
        Mitglied hinzufügen
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={members.length === 0}
        className="mx-auto rounded-xl bg-blue-500 px-6 py-3 min-h-[44px] text-white disabled:opacity-50"
      >
        Weiter →
      </button>
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
