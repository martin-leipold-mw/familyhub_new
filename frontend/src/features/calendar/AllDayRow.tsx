export interface AllDayChip {
  id: string
  title: string
  colorHex: string
  onClick: () => void
}

export function AllDayRow({ columns }: { columns: AllDayChip[][] }) {
  return (
    <div className="flex border-b border-slate-700">
      <div className="w-12 shrink-0 py-1 text-right text-xs text-slate-400 pr-1">Ganztag</div>
      <div className="flex flex-1">
        {columns.map((chips, i) => (
          <div key={i} className="flex flex-1 flex-col gap-1 p-1">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClick}
                aria-label={chip.title}
                className="truncate rounded px-2 py-1 text-left text-sm font-medium text-slate-900 min-h-[44px]"
                style={{ backgroundColor: chip.colorHex }}
              >
                {chip.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
