export interface EventBlockProps {
  title: string
  timeLabel?: string
  colorHex: string
  top: number
  height: number
  leftPct: number
  widthPct: number
  onClick: () => void
  isRecurring?: boolean
}

export function EventBlock({
  title,
  timeLabel,
  colorHex,
  top,
  height,
  leftPct,
  widthPct,
  onClick,
  isRecurring,
}: EventBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="absolute overflow-hidden rounded-lg px-2 py-1 text-left text-sm font-medium text-slate-900 shadow"
      style={{
        top,
        height,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 4px)`,
        backgroundColor: colorHex,
      }}
    >
      <span className="block truncate">
        {isRecurring && (
          <span aria-label="Serie" className="mr-1">
            🔁
          </span>
        )}
        {title}
      </span>
      {timeLabel && <span className="block truncate text-xs opacity-80">{timeLabel}</span>}
    </button>
  )
}
