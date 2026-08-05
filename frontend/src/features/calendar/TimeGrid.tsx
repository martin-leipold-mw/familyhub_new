import { type ReactNode } from 'react'
import { HOURS, HOUR_PX, GRID_HEIGHT_PX } from './layout'

export function TimeGrid({ children }: { children: ReactNode }) {
  return (
    <div className="flex">
      <div className="w-12 shrink-0" style={{ height: GRID_HEIGHT_PX }}>
        {HOURS.map((h) => (
          <div
            key={h}
            className="relative text-right text-xs text-muted pr-1"
            style={{ height: HOUR_PX }}
          >
            <span className="absolute -top-2 right-1">{String(h).padStart(2, '0')}</span>
          </div>
        ))}
      </div>
      <div className="relative flex flex-1" style={{ height: GRID_HEIGHT_PX }}>
        <div className="pointer-events-none absolute inset-0">
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-subtle"
              style={{ top: i * HOUR_PX }}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}
