import type { MemberResponse } from '@/api/generated/model'
import { memberColorHex } from '@/features/members/colors'

export function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: MemberResponse[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-primary">
      <span>Mitglied</span>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-label={m.name}
            aria-pressed={value === m.id}
            onClick={() => onChange(m.id)}
            className={`rounded-full px-4 py-2 min-h-[44px] text-slate-900 font-medium ${
              value === m.id ? 'ring-4 ring-accent ring-offset-2 ring-offset-surface' : ''
            }`}
            style={{ backgroundColor: memberColorHex(m.color) }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  )
}
