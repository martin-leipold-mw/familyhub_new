import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/routing/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/calendar/CalendarView', () => ({
  CalendarView: () => <div>KALENDER</div>,
}))
vi.mock('@/features/settings/SettingsView', () => ({
  SettingsView: () => <div>EINSTELLUNGEN</div>,
}))
vi.mock('@/features/setup/SetupWizard', () => ({ SetupWizard: () => <div>SETUP</div> }))
vi.mock('@/features/google/OAuthCallback', () => ({ OAuthCallback: () => <div>CALLBACK</div> }))

// App renders its own BrowserRouter; import after mocks.
import AppRoutes from './App'

describe('App routing', () => {
  it('shows the calendar at /', () => {
    // App supplies its own BrowserRouter; render it directly (jsdom default
    // URL is '/') instead of nesting it inside renderWithProviders' router.
    render(<AppRoutes />)
    expect(screen.getByText('KALENDER')).toBeInTheDocument()
  })
})
