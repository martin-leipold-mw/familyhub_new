import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useGetSetupStatus: vi.fn() }))
import { useGetSetupStatus } from '@/api/generated/endpoints/familyHubAPI'
import { SetupGuard } from './SetupGuard'

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<SetupGuard><div>Geschützt</div></SetupGuard>} />
        <Route path="/setup" element={<div>Wizard</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SetupGuard', () => {
  it('shows a loading state', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({ isLoading: true, isError: false, data: undefined } as never)
    renderGuard()
    expect(screen.getByText('Lädt …')).toBeInTheDocument()
  })

  it('shows an error page and does NOT redirect to the wizard on network failure', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({ isLoading: false, isError: true, data: undefined } as never)
    renderGuard()
    expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument()
    expect(screen.queryByText('Wizard')).not.toBeInTheDocument()
  })

  it('shows an error page when data is undefined and isError is false', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({ isLoading: false, isError: false, data: undefined } as never)
    renderGuard()
    expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument()
    expect(screen.queryByText('Wizard')).not.toBeInTheDocument()
  })

  it('redirects to the wizard when setup is incomplete', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      isLoading: false, isError: false, data: { data: { setupCompleted: false } },
    } as never)
    renderGuard()
    expect(screen.getByText('Wizard')).toBeInTheDocument()
  })

  it('renders children when setup is complete', () => {
    vi.mocked(useGetSetupStatus).mockReturnValue({
      isLoading: false, isError: false, data: { data: { setupCompleted: true } },
    } as never)
    renderGuard()
    expect(screen.getByText('Geschützt')).toBeInTheDocument()
  })
})
