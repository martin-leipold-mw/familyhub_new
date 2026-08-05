import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { CalendarView } from './CalendarView'
import type { CalendarEvent } from './useCalendarEvents'
import type { MemberResponse } from '@/api/generated/model'

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
]

vi.mock('@/features/members/useMembersQuery', () => ({
  useMembers: () => ({ members, isLoading: false, isError: false }),
}))

const eventsRef = { current: { events: [] as CalendarEvent[], isLoading: false, isError: false, refetch: vi.fn() } }
vi.mock('./useCalendarEvents', async () => {
  const actual = await vi.importActual<typeof import('./useCalendarEvents')>('./useCalendarEvents')
  return { ...actual, useCalendarEvents: () => eventsRef.current }
})

const syncMock = vi.fn()
const syncStateRef = { current: { isSyncing: false, isError: false } }
vi.mock('./useCalendarSync', () => ({
  useCalendarSync: () => ({ sync: syncMock, ...syncStateRef.current }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  eventsRef.current = { events: [], isLoading: false, isError: false, refetch: vi.fn() }
  syncStateRef.current = { isSyncing: false, isError: false }
  syncMock.mockReset()
  mockNavigate.mockReset()
})

describe('CalendarView', () => {
  it('renders the current period label and week grid by default', () => {
    renderWithProviders(<CalendarView />)
    // week headers exist (7 columns)
    expect(screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d/).length).toBe(7)
  })

  it('switches to day view', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(screen.getAllByText(/^(Mo|Di|Mi|Do|Fr|Sa|So) \d/).length).toBe(1)
  })

  it('shows an error banner with retry when loading fails', async () => {
    const refetch = vi.fn()
    eventsRef.current = { events: [], isLoading: false, isError: true, refetch }
    renderWithProviders(<CalendarView />)
    expect(screen.getByText('Fehler beim Laden der Termine')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('triggers sync from the header', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Synchronisieren' }))
    expect(syncMock).toHaveBeenCalled()
  })

  it('shows the error banner when only the sync fails', () => {
    syncStateRef.current = { isSyncing: false, isError: true }
    renderWithProviders(<CalendarView />)
    expect(screen.getByText('Fehler beim Laden der Termine')).toBeInTheDocument()
  })

  it('shows a loading message while events are loading', () => {
    eventsRef.current = { events: [], isLoading: true, isError: false, refetch: vi.fn() }
    renderWithProviders(<CalendarView />)
    expect(screen.getByText('Termine werden geladen …')).toBeInTheDocument()
  })

  it('navigates the period and returns to today', async () => {
    renderWithProviders(<CalendarView />)
    const initialLabel = screen.getByRole('heading', { level: 1 }).textContent
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Heute' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(initialLabel)
  })

  it('navigates to settings when the gear icon is clicked', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('opens the create dialog when an empty slot is clicked', async () => {
    renderWithProviders(<CalendarView />)
    const [slotButton] = screen.getAllByLabelText(/^Neuer Termin/)
    await userEvent.click(slotButton)
    expect(screen.getByRole('dialog', { name: 'Termin anlegen' })).toBeInTheDocument()
  })

  it('closes the dialog when Abbrechen is clicked', async () => {
    renderWithProviders(<CalendarView />)
    const [slotButton] = screen.getAllByLabelText(/^Neuer Termin/)
    await userEvent.click(slotButton)
    expect(screen.getByRole('dialog', { name: 'Termin anlegen' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the edit dialog when an existing event is clicked', async () => {
    const today = new Date()
    const event: CalendarEvent = {
      id: 'e1',
      title: 'Schule',
      memberId: 'm1',
      calendarId: 'cal-a',
      isAllDay: false,
      start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0),
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0),
      allDayStart: null,
      allDayEnd: null,
      location: null,
      description: null,
      reminderUseDefault: true,
      reminderMinutes: null,
      recurringEventId: null,
    }
    eventsRef.current = { events: [event], isLoading: false, isError: false, refetch: vi.fn() }
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: /Schule/ }))
    expect(screen.getByRole('dialog', { name: 'Termin bearbeiten' })).toBeInTheDocument()
  })

  it('renders the agenda list when the agenda view is selected', async () => {
    renderWithProviders(<CalendarView />)
    await userEvent.click(screen.getByRole('button', { name: 'Agenda' }))
    expect(await screen.findByRole('button', { name: 'Agenda', pressed: true })).toBeInTheDocument()
    expect(
      await screen.findByText('Keine Termine in den nächsten 30 Tagen.'),
    ).toBeInTheDocument()
  })
})
