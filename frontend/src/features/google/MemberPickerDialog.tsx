import type { MemberResponse } from '@/api/generated/model'
import { MEMBER_COLORS, roleLabel, type MemberColor } from '@/features/members/colors'

export function MemberPickerDialog({
  members,
  onSelect,
  onCancel,
}: {
  members: MemberResponse[]
  onSelect: (memberId: string) => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Mitglied auswählen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary">Für welches Mitglied?</h2>
        {members.length === 0 ? (
          <p className="text-muted">Bitte zuerst ein Mitglied anlegen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => {
              const ring = MEMBER_COLORS[m.color as MemberColor] ?? MEMBER_COLORS.blue
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className="w-full flex items-center gap-3 rounded-xl bg-surface-2 p-3 min-h-[44px] text-left"
                  >
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-surface flex-shrink-0"
                      style={{ boxShadow: `0 0 0 3px ${ring}` }}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-primary">{m.name.charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-primary font-medium">{m.name}</span>
                      <span className="text-sm text-muted">{roleLabel(m.role)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="self-end min-h-[44px] rounded-xl bg-surface-2 px-4 text-primary"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
