import type { MemberResponse } from '@/api/generated/model'
import { MEMBER_COLORS, roleLabel, type MemberColor } from './colors'

export function MemberCard({
  member,
  onClick,
}: {
  member: MemberResponse
  onClick?: () => void
}) {
  const ring = MEMBER_COLORS[member.color as MemberColor] ?? MEMBER_COLORS.blue
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={member.name}
      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-800 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-white"
    >
      <span
        className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-slate-700"
        style={{ boxShadow: `0 0 0 4px ${ring}` }}
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl text-white">{member.name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="text-lg font-semibold text-white">{member.name}</span>
      <span className="text-sm text-slate-400">{roleLabel(member.role)}</span>
    </button>
  )
}
