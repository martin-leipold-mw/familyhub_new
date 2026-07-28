import { type ReactNode } from 'react'

/**
 * Minimal application frame. Prepared for a future section navigation
 * (Aufgaben/Haushalt/Fotos); in Schritt 4 it only frames the page content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-900">{children}</div>
}
