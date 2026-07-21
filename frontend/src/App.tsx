import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HealthPage from '@/features/health/HealthPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HealthPage />} />
      </Routes>
    </BrowserRouter>
  )
}
