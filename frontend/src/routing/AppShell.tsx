import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from '@/features/google/RevokedConnectionSnackbars'

const SECTIONS = [
  { to: '/', label: 'Kalender' },
  { to: '/tasks', label: 'Aufgaben' },
  { to: '/chores', label: 'Haushalt' },
  { to: '/settings', label: 'Einstellungen' },
]

/**
 * Application frame. Renders the section navigation (Kalender/Aufgaben/
 * Haushalt/Einstellungen) above the page content, wraps everything in a
 * SnackbarProvider, and mounts the revoked-connection watcher, which pops a
 * per-account reconnect snackbar when a Google connection's token has
 * expired.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider>
      <div className="min-h-screen bg-bg">
        <nav className="flex gap-2 p-2 border-b border-subtle bg-surface">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end
              className={({ isActive }) =>
                `min-h-[44px] px-4 flex items-center rounded-xl text-lg ${
                  isActive ? 'bg-accent text-white' : 'text-primary'
                }`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        {children}
      </div>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>
  )
}
