import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { SectionCard } from './SectionCard'
import { MemberGrid } from '@/features/members/MemberGrid'
import { AddMemberDialog } from '@/features/members/AddMemberDialog'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { useMembers } from '@/features/members/useMembersQuery'
import { useGoogleConnections } from '@/features/google/useGoogleConnections'

export function MemberSection() {
  const { members } = useMembers()
  const { connections } = useGoogleConnections()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberResponse | null>(null)

  const linkedMemberIds = connections.map((c) => c.memberId)

  return (
    <SectionCard title="Mitglieder" action={{ label: 'Mitglied hinzufügen', onClick: () => setAdding(true) }}>
      <MemberGrid members={members} onSelect={setEditing} linkedMemberIds={linkedMemberIds} />
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} />}
    </SectionCard>
  )
}
