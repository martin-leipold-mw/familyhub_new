import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarHeader } from './CalendarHeader'

function setup(overrides = {}) {
  const props = {
    label: 'Juli 2026',
    view: 'week' as const,
    onViewChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onSync: vi.fn(),
    isSyncing: false,
    onOpenSettings: vi.fn(),
    ...overrides,
  }
  render(<CalendarHeader {...props} />)
  return props
}

describe('CalendarHeader', () => {
  it('shows the period label', () => {
    setup()
    expect(screen.getByText('Juli 2026')).toBeInTheDocument()
  })
  it('switches to day view', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    expect(props.onViewChange).toHaveBeenCalledWith('day')
  })
  it('navigates and jumps to today', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Zeitraum' }))
    await userEvent.click(screen.getByRole('button', { name: 'Heute' }))
    expect(props.onPrev).toHaveBeenCalled()
    expect(props.onNext).toHaveBeenCalled()
    expect(props.onToday).toHaveBeenCalled()
  })
  it('triggers sync and settings', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Synchronisieren' }))
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(props.onSync).toHaveBeenCalled()
    expect(props.onOpenSettings).toHaveBeenCalled()
  })
  it('spins the sync icon while syncing', () => {
    setup({ isSyncing: true })
    const button = screen.getByRole('button', { name: 'Synchronisieren' })
    expect(button.querySelector('svg')).toHaveClass('animate-spin')
  })
  it('shows an Agenda toggle and hides prev/next in agenda mode', () => {
    render(
      <CalendarHeader
        label="Juli 2026" view="agenda"
        onViewChange={() => {}} onPrev={() => {}} onNext={() => {}}
        onToday={() => {}} onSync={() => {}} isSyncing={false} onOpenSettings={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Agenda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vorheriger Zeitraum' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Nächster Zeitraum' })).toBeNull()
  })
})
