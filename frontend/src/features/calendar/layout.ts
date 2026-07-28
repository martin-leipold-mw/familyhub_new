export const START_HOUR = 6
export const END_HOUR = 22
export const HOUR_PX = 50
export const MIN_BLOCK_PX = 24
export const GRID_HEIGHT_PX = (END_HOUR - START_HOUR) * HOUR_PX // 800

export const HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i,
)

const GRID_MINUTES = (END_HOUR - START_HOUR) * 60 // 960

export interface TimedInput {
  id: string
  start: Date
  end: Date
}

export interface Positioned {
  id: string
  top: number
  height: number
  leftPct: number
  widthPct: number
}

function minutesFromGridStart(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() - START_HOUR * 60
}

function clampMinutes(m: number): number {
  return Math.max(0, Math.min(m, GRID_MINUTES))
}

export function verticalPosition(start: Date, end: Date): { top: number; height: number } {
  const startMin = clampMinutes(minutesFromGridStart(start))
  const endMin = clampMinutes(minutesFromGridStart(end))
  const top = (startMin / 60) * HOUR_PX
  const rawHeight = ((endMin - startMin) / 60) * HOUR_PX
  return { top, height: Math.max(rawHeight, MIN_BLOCK_PX) }
}

export function nowLineTop(now: Date): number | null {
  const minutes = minutesFromGridStart(now)
  if (minutes < 0 || minutes >= GRID_MINUTES) return null
  return (minutes / 60) * HOUR_PX
}

/**
 * Groups events that overlap in time into side-by-side columns and splits the
 * available width evenly within each connected overlap cluster (FA-KAL-07).
 *
 * Lays out timed events. Events lying entirely outside the visible
 * 06:00–22:00 window are dropped (they would otherwise render as a phantom
 * MIN_BLOCK_PX block at the grid edge). Events that partially overlap are
 * kept and clamped by verticalPosition.
 */
export function layoutDay(events: TimedInput[]): Positioned[] {
  const visible = events.filter(
    (e) => minutesFromGridStart(e.end) > 0 && minutesFromGridStart(e.start) < GRID_MINUTES,
  )
  const sorted = [...visible].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  )

  const result: Positioned[] = []
  let cluster: { id: string; col: number; top: number; height: number }[] = []
  let columnEnds: number[] = [] // last end-time per column in the current cluster
  let clusterEnd = -Infinity

  const flush = () => {
    const cols = columnEnds.length
    const width = 100 / cols
    for (const item of cluster) {
      result.push({
        id: item.id,
        top: item.top,
        height: item.height,
        leftPct: item.col * width,
        widthPct: width,
      })
    }
    cluster = []
    columnEnds = []
    clusterEnd = -Infinity
  }

  for (const ev of sorted) {
    if (cluster.length && ev.start.getTime() >= clusterEnd) flush()

    let col = columnEnds.findIndex((end) => end <= ev.start.getTime())
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(ev.end.getTime())
    } else {
      columnEnds[col] = ev.end.getTime()
    }

    const { top, height } = verticalPosition(ev.start, ev.end)
    cluster.push({ id: ev.id, col, top, height })
    clusterEnd = Math.max(clusterEnd, ev.end.getTime())
  }
  if (cluster.length) flush()

  return result
}
