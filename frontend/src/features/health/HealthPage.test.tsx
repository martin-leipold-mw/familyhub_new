import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import HealthPage from './HealthPage'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({
  useGetHealth: vi.fn(),
}))

import { useGetHealth } from '@/api/generated/endpoints/familyHubAPI'

const mockUseGetHealth = vi.mocked(useGetHealth)

describe('HealthPage', () => {
  it('zeigt Ladeindikator während des Ladens', () => {
    mockUseGetHealth.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useGetHealth>)

    render(<HealthPage />)
    expect(screen.getByText('Verbinde mit Server…')).toBeInTheDocument()
  })

  it('zeigt Fehlermeldung bei Server-Fehler', () => {
    mockUseGetHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useGetHealth>)

    render(<HealthPage />)
    expect(screen.getByText('Server nicht erreichbar')).toBeInTheDocument()
  })

  it('zeigt System bereit wenn Status UP', () => {
    mockUseGetHealth.mockReturnValue({
      data: {
        data: { status: 'UP', version: 'test', timestamp: '2026-07-21T10:00:00Z' },
        status: 200,
        headers: new Headers(),
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetHealth>)

    render(<HealthPage />)
    expect(screen.getByText('FamilyHub')).toBeInTheDocument()
    expect(screen.getByText('System bereit')).toBeInTheDocument()
    expect(screen.getByText('Version: test')).toBeInTheDocument()
  })

  it('zeigt nicht verfügbar wenn Status nicht UP', () => {
    mockUseGetHealth.mockReturnValue({
      data: {
        data: { status: 'DOWN', version: 'test', timestamp: '2026-07-21T10:00:00Z' },
        status: 200,
        headers: new Headers(),
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetHealth>)

    render(<HealthPage />)
    expect(screen.getByText('System nicht verfügbar')).toBeInTheDocument()
  })
})
