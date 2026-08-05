import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { PinSessionProvider } from '@/features/pin/PinSessionContext'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PinSessionProvider>
          <App />
        </PinSessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
