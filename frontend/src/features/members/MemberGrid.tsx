import type { MemberResponse } from '@/api/generated/model'
import { MemberCard } from './MemberCard'

export function MemberGrid({
  members,
  onSelect,
  linkedMemberIds = [],
}: {
  members: MemberResponse[]
  onSelect?: (member: MemberResponse) => void
  linkedMemberIds?: string[]
}) {
  if (members.length === 0) {
    return (
      <p className="text-muted text-center py-8">Noch keine Familienmitglieder angelegt.</p>
    )
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          onClick={() => onSelect?.(member)}
          linked={linkedMemberIds.includes(member.id)}
        />
      ))}
    </div>
  )
}
