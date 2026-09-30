import { Pencil, Pause, Play } from 'lucide-react'
import type { ChoreResponse } from '@/api/generated/model'
import { intervalLabel, GROUP_LABELS, type ChoreGroup } from './choreLabels'
import type { ChoreStatus } from './choreStatus'

const TONE_CLASS: Record<ChoreStatus['tone'], string> = {
  paused: 'text-muted',
  open: 'text-primary',
  due: 'text-muted',
  waiting: 'text-warn',
  blocked: 'text-danger',
}

type ChoreSettingsRowProps = {
  chore: ChoreResponse
  status: ChoreStatus
  onEdit: (chore: ChoreResponse) => void
  onToggleActive: (chore: ChoreResponse, next: boolean) => void
}

export function ChoreSettingsRow({ chore, status, onEdit, onToggleActive }: ChoreSettingsRowProps) {
  const config = `${intervalLabel(chore.intervalDays)} · ${
    GROUP_LABELS[chore.assignmentGroup as ChoreGroup]
  } · ${chore.points} Pkt.`

  return (
    <li className={`flex items-center gap-4 rounded-2xl bg-surface-2 p-4 ${chore.isActive ? '' : 'opacity-60'}`}>
      <span aria-hidden className="text-4xl leading-none">{chore.icon}</span>

      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-primary">{chore.name}</span>
        <span className="block text-sm text-muted">{config}</span>
      </span>

      <span className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</span>

      <button
        type="button"
        aria-label={`${chore.name} ${chore.isActive ? 'pausieren' : 'aktivieren'}`}
        onClick={() => onToggleActive(chore, !chore.isActive)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface text-muted"
      >
        {chore.isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
      </button>

      <button
        type="button"
        aria-label={`${chore.name} bearbeiten`}
        onClick={() => onEdit(chore)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-surface text-muted"
      >
        <Pencil aria-hidden />
      </button>
    </li>
  )
}
