import { type ReactNode } from 'react'
import { ConnectionRevokedBanner } from '@/features/google/ConnectionRevokedBanner'

/**
 * Minimal application frame. Renders the global revoked-connection banner
 * above the page content so it is visible on every screen. Prepared for a
 * future section navigation (Aufgaben/Haushalt/Fotos).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900">
      <ConnectionRevokedBanner />
      {children}
    </div>
  )
}
