import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({
  useGoogleConnections: vi.fn(),
}))

vi.mock('@/features/google/useCalendars', () => ({
  useCalendarsForMember: vi.fn(),
  useSaveSelectedCalendarsMutation: vi.fn(),
}))

let hasPinSession = false
vi.mock('@/features/pin/PinSessionContext', () => ({
  usePinSession: () => ({ hasPinSession, setSession: vi.fn(), sessionToken: null, clearSession: vi.fn() }),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import { useCalendarsForMember, useSaveSelectedCalendarsMutation } from '@/features/google/useCalendars'
import { CalendarManagement } from './CalendarManagement'

const connection1 = {
  connectionId: 'conn-1',
  memberId: 'm1',
  email: 'anna@gmail.com',
  name: 'Anna',
  status: 'ACTIVE',
  lastSyncedAt: '2024-01-15T10:00:00Z',
  scopes: ['calendar'],
}

const calendar1 = {
  id: 'cal1',
  summary: 'Persönlicher Kalender',
  backgroundColor: '#4285f4',
  isPrimary: true,
  isSelected: true,
}

const calendar2 = {
  id: 'cal2',
  summary: 'Arbeit',
  backgroundColor: null,
  isPrimary: false,
  isSelected: false,
}

describe('CalendarManagement', () => {
  const mutateAsync = vi.fn()

  beforeEach(() => {
    hasPinSession = false
    vi.clearAllMocks()

    vi.mocked(useSaveSelectedCalendarsMutation).mockReturnValue({
      mutateAsync,
    } as never)

    mutateAsync.mockResolvedValue(undefined)
  })

  it('shows loading state when connections are loading', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: true,
      isError: false,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Kalender verwalten')).toBeInTheDocument()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows error state when connections fail to load', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: true,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Fehler beim Laden der Verbindungen.')).toBeInTheDocument()
  })

  it('shows empty state when no connections exist', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Keine Google-Konten verbunden.')).toBeInTheDocument()
  })

  it('shows loading state for calendars within a connection section', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [],
      isLoading: true,
      isError: false,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Anna – Kalender')).toBeInTheDocument()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows error state for calendars within a connection section', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [],
      isLoading: false,
      isError: true,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Fehler beim Laden der Kalender.')).toBeInTheDocument()
  })

  it('shows empty state when no calendars found for a connection', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Keine Kalender gefunden.')).toBeInTheDocument()
  })

  it('renders calendars with checkboxes reflecting isSelected state', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1, calendar2],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    expect(screen.getByText('Persönlicher Kalender')).toBeInTheDocument()
    expect(screen.getByText('Arbeit')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('toggles unchecked checkbox to checked on click', () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar2],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('toggles checked checkbox to unchecked on click', () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('calls mutateAsync with correct args when Speichern is clicked', async () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        data: {
          memberId: 'm1',
          calendarIds: ['cal1'],
        },
      })
    )
  })

  it('disables checkboxes and Speichern button and shows hint when no PIN session', () => {
    hasPinSession = false
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1, calendar2],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    expect(screen.getByText('Melde dich mit PIN an, um Kalender zu verwalten.')).toBeInTheDocument()
  })

  it('enables checkboxes and Speichern button and hides hint when PIN session active', () => {
    hasPinSession = true
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1, calendar2],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((cb) => expect(cb).not.toBeDisabled())
    expect(screen.getByRole('button', { name: 'Speichern' })).not.toBeDisabled()
    expect(screen.queryByText('Melde dich mit PIN an, um Kalender zu verwalten.')).not.toBeInTheDocument()
  })

  it('shows color swatch with background color when backgroundColor is present', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar1],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const swatch = document.querySelector('[style*="background-color"]')
    expect(swatch).not.toBeNull()
    expect(swatch).toHaveStyle({ backgroundColor: '#4285f4' })
  })

  it('shows fallback color swatch when backgroundColor is null', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({
      connections: [connection1],
      isLoading: false,
      isError: false,
    })
    vi.mocked(useCalendarsForMember).mockReturnValue({
      calendars: [calendar2],
      isLoading: false,
      isError: false,
    })
    render(<CalendarManagement />)
    const swatch = document.querySelector('.bg-slate-500')
    expect(swatch).not.toBeNull()
  })
})
