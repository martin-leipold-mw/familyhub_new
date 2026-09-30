import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/routing/SetupGuard', () => ({
  SetupGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/calendar/CalendarView', () => ({
  CalendarView: () => <div>KALENDER</div>,
}))
vi.mock('@/features/tasks/TasksView', () => ({
  TasksView: () => <div>AUFGABEN</div>,
}))
vi.mock('@/features/chores/ChoresView', () => ({
  ChoresView: () => <div>HAUSHALT</div>,
}))
vi.mock('@/features/settings/SettingsView', () => ({
  SettingsView: () => <div>EINSTELLUNGEN</div>,
}))
vi.mock('@/features/setup/SetupWizard', () => ({ SetupWizard: () => <div>SETUP</div> }))
vi.mock('@/features/google/OAuthCallback', () => ({ OAuthCallback: () => <div>CALLBACK</div> }))
vi.mock('@/features/google/RevokedConnectionSnackbars', () => ({
  RevokedConnectionSnackbars: () => <div data-testid="revoked-snackbars" />,
}))

// App renders its own BrowserRouter; import after mocks.
import AppRoutes from './App'

describe('App routing', () => {
  afterEach(() => {
    // Restore jsdom's default URL so the route doesn't leak into other tests.
    window.history.pushState({}, '', '/')
  })

  it('shows the calendar at /', () => {
    // App supplies its own BrowserRouter; render it directly (jsdom default
    // URL is '/') instead of nesting it inside renderWithProviders' router.
    render(<AppRoutes />)
    expect(screen.getByText('KALENDER')).toBeInTheDocument()
  })

  it('shows the tasks view at /tasks', () => {
    window.history.pushState({}, '', '/tasks')
    render(<AppRoutes />)
    expect(screen.getByText('AUFGABEN')).toBeInTheDocument()
  })

  it('shows the chores view at /chores', () => {
    window.history.pushState({}, '', '/chores')
    render(<AppRoutes />)
    expect(screen.getByText('HAUSHALT')).toBeInTheDocument()
  })
})
