import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SetupGuard } from '@/routing/SetupGuard'
import NotFound from '@/routing/NotFound'
import { SetupWizard } from '@/features/setup/SetupWizard'
import { SettingsView } from '@/features/settings/SettingsView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route
          path="/"
          element={
            <SetupGuard>
              <SettingsView />
            </SetupGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
