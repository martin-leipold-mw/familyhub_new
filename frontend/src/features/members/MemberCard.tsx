import type { MemberResponse } from '@/api/generated/model'
import { Check } from 'lucide-react'
import { MEMBER_COLORS, roleLabel, type MemberColor } from './colors'

export function MemberCard({
  member,
  onClick,
  linked = false,
}: {
  member: MemberResponse
  onClick?: () => void
  linked?: boolean
}) {
  const ring = MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={member.name}
      className="relative flex flex-col items-center gap-2 p-4 rounded-2xl bg-surface-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent"
    >
      <span
        className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-surface"
        style={{ boxShadow: `0 0 0 4px ${ring}` }}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-primary">{member.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      {linked && (
        <span
          aria-label="Mit Google verknüpft"
          className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full bg-accent text-white"
        >
          <Check aria-hidden className="w-4 h-4" />
        </span>
      )}
      <span className="text-lg font-semibold text-primary">{member.name}</span>
      <span className="text-sm text-muted">{roleLabel(member.role)}</span>
    </button>
  )
}
