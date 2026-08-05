import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/features/google/useGoogleConnections', () => ({ useGoogleConnections: vi.fn() }))
vi.mock('@/features/google/useCalendars', () => ({
  useAllCalendars: vi.fn(),
  useCalendarsForMember: vi.fn(),
  useSaveSelectedCalendarsMutation: vi.fn(),
  useUpdateCalendarFlagsMutation: vi.fn(),
}))

import { useGoogleConnections } from '@/features/google/useGoogleConnections'
import {
  useAllCalendars,
  useCalendarsForMember,
  useSaveSelectedCalendarsMutation,
  useUpdateCalendarFlagsMutation,
} from '@/features/google/useCalendars'
import { CalendarSection } from './CalendarSection'

const connection = { connectionId: 'c1', memberId: 'm1', email: 'a@x.de', name: 'Anna', status: 'ACTIVE', lastSyncedAt: null, scopes: [] }
const cal = { id: 'cal1', summary: 'Familie', color: '#123456', isSelected: true, isShared: false, isWriteTarget: false }

const save = vi.fn()
const flags = vi.fn()

function expand() {
  fireEvent.click(screen.getByRole('button', { expanded: false }))
}

describe('CalendarSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAllCalendars).mockReturnValue({ calendars: [cal, { ...cal, id: 'cal2', isSelected: false }], isLoading: false, isError: false } as never)
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [cal], isLoading: false, isError: false } as never)
    vi.mocked(useSaveSelectedCalendarsMutation).mockReturnValue({ mutateAsync: save } as never)
    vi.mocked(useUpdateCalendarFlagsMutation).mockReturnValue({ mutateAsync: flags } as never)
    save.mockResolvedValue(undefined)
    flags.mockResolvedValue(undefined)
    // Default: one active connection loaded (section not loading/erroring).
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [connection], isLoading: false, isError: false } as never)
  })

  // ── section-level branches ──
  it('shows section loading', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: true, isError: false } as never)
    render(<CalendarSection />)
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows section error', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: true } as never)
    render(<CalendarSection />)
    expect(screen.getByText('Fehler beim Laden der Verbindungen.')).toBeInTheDocument()
  })

  it('shows the selected count and stays collapsed by default', () => {
    render(<CalendarSection />)
    expect(screen.getByText('Kalender · 1 ausgewählt')).toBeInTheDocument()
    expect(screen.queryByText('Anna – Kalender')).not.toBeInTheDocument()
  })

  it('shows an empty note when expanded with no connections', () => {
    vi.mocked(useGoogleConnections).mockReturnValue({ connections: [], isLoading: false, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Keine Google-Konten verbunden.')).toBeInTheDocument()
  })

  // ── inner ConnectionCalendars branches ──
  it('expands to reveal per-connection calendars', () => {
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Anna – Kalender')).toBeInTheDocument()
    expect(screen.getByText('Familie')).toBeInTheDocument()
  })

  it('shows inner loading', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: true, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Wird geladen…')).toBeInTheDocument()
  })

  it('shows inner error', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: false, isError: true } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Fehler beim Laden der Kalender.')).toBeInTheDocument()
  })

  it('shows the empty-calendars note', () => {
    vi.mocked(useCalendarsForMember).mockReturnValue({ calendars: [], isLoading: false, isError: false } as never)
    render(<CalendarSection />)
    expand()
    expect(screen.getByText('Keine Kalender gefunden.')).toBeInTheDocument()
  })

  it('toggles a calendar off and on, then saves the selection', async () => {
    render(<CalendarSection />)
    expand()
    const selectCheckbox = screen.getByRole('checkbox', { name: 'Familie' })
    fireEvent.click(selectCheckbox) // deselect
    fireEvent.click(selectCheckbox) // reselect (covers both handleToggle branches)
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarIds: ['cal1'] } }),
    )
  })

  it('sets a calendar as shared', async () => {
    render(<CalendarSection />)
    expand()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Geteilt/Familie' }))
    await waitFor(() =>
      expect(flags).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal1', isShared: true } }),
    )
  })

  it('sets a calendar as the write target', async () => {
    render(<CalendarSection />)
    expand()
    fireEvent.click(screen.getByRole('radio', { name: 'Primärkalender' }))
    await waitFor(() =>
      expect(flags).toHaveBeenCalledWith({ data: { memberId: 'm1', calendarId: 'cal1', isWriteTarget: true } }),
    )
  })
})
