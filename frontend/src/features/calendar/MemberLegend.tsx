import type { MemberResponse } from '@/api/generated/model'
import { memberColorHex } from '@/features/members/colors'

export function MemberLegend({ members }: { members: MemberResponse[] }) {
  if (members.length === 0) {
    return null
  }

  return (
    <div aria-label="Mitglieder-Legende" className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-2">
      {members.map((m) => (
        <span key={m.id} className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: memberColorHex(m.color) }}
            aria-hidden
          />
          <span className="text-sm text-primary">{m.name}</span>
        </span>
      ))}
    </div>
  )
}
