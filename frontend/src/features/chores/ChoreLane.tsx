import { memberColorHex } from '@/features/members/colors'
import { ChoreCard } from './ChoreCard'
import { canUndo } from './undoWindow'
import type { ChoreLaneModel } from './choreLanes'

type ChoreLaneProps = {
  lane: ChoreLaneModel
  now: Date
  onComplete: (id: string) => void
  onUndo: (id: string) => void
}

/**
 * Eine Spalte je aktivem Mitglied — auch ohne Aufgaben. Erledigtes bleibt bis
 * zum nächsten Morgen sichtbar: ein Kind soll sehen, was es geschafft hat,
 * statt dass die Aufgabe spurlos verschwindet.
 */
export function ChoreLane({ lane, now, onComplete, onUndo }: ChoreLaneProps) {
  const color = memberColorHex(lane.member.color)
  const countLabel = lane.open.length === 0 ? 'Alles erledigt! 🎉' : `${lane.open.length} offen`

  return (
    <section className="flex min-w-[20rem] flex-col gap-3 rounded-2xl bg-surface p-4">
      <header className="flex items-center gap-3">
        <span
          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-surface-2"
          style={{ boxShadow: `0 0 0 4px ${color}` }}
        >
          {lane.member.avatarUrl ? (
            <img src={lane.member.avatarUrl} alt={lane.member.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl text-primary">{lane.member.name.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <span>
          <span className="block text-xl font-bold text-primary">{lane.member.name}</span>
          <span className="block text-sm text-muted">{countLabel}</span>
        </span>
      </header>

      <ul className="flex flex-col gap-3">
        {lane.open.map((a) => (
          <ChoreCard
            key={a.id}
            assignment={a}
            color={color}
            undoable={false}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        ))}
        {lane.completed.map((a) => (
          <ChoreCard
            key={a.id}
            assignment={a}
            color={color}
            undoable={canUndo(a.completedAt, now)}
            onComplete={onComplete}
            onUndo={onUndo}
          />
        ))}
      </ul>
    </section>
  )
}
