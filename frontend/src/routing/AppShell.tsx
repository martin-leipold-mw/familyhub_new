import { type ReactNode } from 'react'
import { SnackbarProvider } from '@/routing/SnackbarProvider'
import { RevokedConnectionSnackbars } from '@/features/google/RevokedConnectionSnackbars'

/**
 * Minimal application frame. Wraps the page in a SnackbarProvider and mounts
 * the revoked-connection watcher, which pops a per-account reconnect snackbar
 * when a Google connection's token has expired. Prepared for a future section
 * navigation (Aufgaben/Haushalt/Fotos).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider>
      <div className="min-h-screen bg-bg">{children}</div>
      <RevokedConnectionSnackbars />
    </SnackbarProvider>
  )
}
