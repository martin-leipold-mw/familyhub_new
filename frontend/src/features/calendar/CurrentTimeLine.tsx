import { nowLineTop } from './layout'

export function CurrentTimeLine({ now }: { now: Date }) {
  const top = nowLineTop(now)
  if (top === null) return null
  return (
    <div
      data-testid="current-time-line"
      className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-danger"
      style={{ top }}
    />
  )
}
