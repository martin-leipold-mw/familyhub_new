import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMembers } from '@/features/members/useMembersQuery'
import { memberColorHex } from '@/features/members/colors'
import { CalendarHeader } from './CalendarHeader'
import { MemberLegend } from './MemberLegend'
import { WeekGrid } from './WeekGrid'
import { DayGrid } from './DayGrid'
import { AgendaList } from './AgendaList'
import { EventDialog } from './EventDialog'
import { useCalendarEvents, type CalendarEvent } from './useCalendarEvents'
import { useCalendarSync } from './useCalendarSync'
import { periodLabel, shiftAnchor, type CalendarViewMode } from './dates'

type DialogState =
  | { mode: 'create'; date: Date }
  | { mode: 'edit'; event: CalendarEvent }
  | null

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function CalendarView() {
  const navigate = useNavigate()
  const now = useNow(60_000)
  const [view, setView] = useState<CalendarViewMode>('week')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [dialog, setDialog] = useState<DialogState>(null)

  const { members } = useMembers()
  const { events, isLoading, isError, refetch } = useCalendarEvents(anchor, view)
  const sync = useCalendarSync()

  const memberColors = new Map(members.map((m) => [m.id, memberColorHex(m.color)]))

  const gridProps = {
    anchor,
    events,
    memberColors,
    now,
    onEventClick: (event: CalendarEvent) => setDialog({ mode: 'edit', event }),
    onSlotClick: (date: Date) => setDialog({ mode: 'create', date }),
  }

  return (
    <div className="min-h-screen bg-bg">
      <CalendarHeader
        label={periodLabel(anchor)}
        view={view}
        onViewChange={setView}
        onPrev={() => setAnchor((a) => shiftAnchor(a, view, -1))}
        onNext={() => setAnchor((a) => shiftAnchor(a, view, 1))}
        onToday={() => setAnchor(new Date())}
        onSync={() => void sync.sync()}
        isSyncing={sync.isSyncing}
        onOpenSettings={() => navigate('/settings')}
      />

      <MemberLegend members={members} />

      {(isError || sync.isError) && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl bg-danger-weak p-3">
          <span className="text-danger">Fehler beim Laden der Termine</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-danger px-3 py-2 min-h-[44px] text-white"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && <p className="px-4 py-2 text-muted">Termine werden geladen …</p>}

      <div className="overflow-y-auto px-2 pb-4">
        {view === 'week' && <WeekGrid {...gridProps} />}
        {view === 'day' && <DayGrid {...gridProps} />}
        {view === 'agenda' && <AgendaList {...gridProps} />}
      </div>

      {dialog && (
        <EventDialog
          members={members}
          initial={dialog.mode === 'edit' ? dialog.event : null}
          defaultDate={dialog.mode === 'create' ? dialog.date : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
