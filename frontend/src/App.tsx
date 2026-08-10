import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SetupGuard } from '@/routing/SetupGuard'
import { AppShell } from '@/routing/AppShell'
import NotFound from '@/routing/NotFound'
import { SetupWizard } from '@/features/setup/SetupWizard'
import { CalendarView } from '@/features/calendar/CalendarView'
import { TasksView } from '@/features/tasks/TasksView'
import { SettingsView } from '@/features/settings/SettingsView'
import { OAuthCallback } from '@/features/google/OAuthCallback'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route
          path="/"
          element={
            <SetupGuard>
              <AppShell>
                <CalendarView />
              </AppShell>
            </SetupGuard>
          }
        />
        <Route
          path="/tasks"
          element={
            <SetupGuard>
              <AppShell>
                <TasksView />
              </AppShell>
            </SetupGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <SetupGuard>
              <AppShell>
                <SettingsView />
              </AppShell>
            </SetupGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
