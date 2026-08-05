import { ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import type { CalendarViewMode } from './dates'

export interface CalendarHeaderProps {
  label: string
  view: CalendarViewMode
  onViewChange: (v: CalendarViewMode) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onSync: () => void
  isSyncing: boolean
  onOpenSettings: () => void
}

const BTN = 'rounded-xl bg-surface-2 px-4 py-3 min-h-[44px] min-w-[44px] text-primary'

export function CalendarHeader({
  label,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onSync,
  isSyncing,
  onOpenSettings,
}: CalendarHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-3 p-4">
      <h1 className="text-2xl font-bold text-primary mr-auto">{label}</h1>

      <div className="flex overflow-hidden rounded-xl">
        {(['day', 'week', 'agenda'] as CalendarViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onViewChange(v)}
            className={`px-4 py-3 min-h-[44px] ${view === v ? 'bg-accent text-white' : 'bg-surface-2 text-primary'}`}
          >
            {v === 'day' ? 'Tag' : v === 'week' ? 'Woche' : 'Agenda'}
          </button>
        ))}
      </div>

      {view !== 'agenda' && (
        <>
          <button type="button" aria-label="Vorheriger Zeitraum" onClick={onPrev} className={BTN}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" onClick={onToday} className={BTN}>
            Heute
          </button>
          <button type="button" aria-label="Nächster Zeitraum" onClick={onNext} className={BTN}>
            <ChevronRight aria-hidden />
          </button>
        </>
      )}
      {view === 'agenda' && (
        <button type="button" onClick={onToday} className={BTN}>
          Heute
        </button>
      )}

      <button
        type="button"
        aria-label="Synchronisieren"
        onClick={onSync}
        disabled={isSyncing}
        className={`${BTN} disabled:opacity-50`}
      >
        <RefreshCw aria-hidden className={isSyncing ? 'animate-spin' : ''} />
      </button>
      <button type="button" aria-label="Einstellungen" onClick={onOpenSettings} className={BTN}>
        <Settings aria-hidden />
      </button>
    </header>
  )
}
