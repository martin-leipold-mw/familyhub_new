import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/testUtils'
import { CalendarView } from './CalendarView'
import type { MemberResponse } from '@/api/generated/model'

const members: MemberResponse[] = [
  { id: 'm1', name: 'Anna', role: 'child', color: 'pink', isActive: true, createdAt: '', updatedAt: '' },
]

vi.mock('@/features/members/useMembersQuery', () => ({
  useMembers: () => ({ members, isLoading: false, isError: false }),
}))

const eventsRef = { current: { events: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() } }
vi.mock('./useCalendarEvents', async () => {
  const actual = await vi.importActual<typeof import('./useCalendarEvents')>('./useCalendarEvents')
  return { ...actual, useCalendarEvents: () => eventsRef.current }
})

const syncMock = vi.fn()
vi.mock('./useCalendarSync', () => ({
  useCalendarSync: () => ({ sync: syncMock, isSyncing: false, isError: false }),
}))

beforeEach(() => {
  eventsRef.current = { events: [], isLoading: false, isError: false, refetch: vi.fn() }
  syncMock.mockReset()
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
})
