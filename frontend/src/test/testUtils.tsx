import { type ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PinSessionProvider } from '@/features/pin/PinSessionContext'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = createTestQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <PinSessionProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </PinSessionProvider>
    </QueryClientProvider>,
  )
}
