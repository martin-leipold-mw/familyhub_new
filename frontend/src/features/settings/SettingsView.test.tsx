import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/features/pin/PinGate', () => ({
  PinGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/theme/ThemeToggle', () => ({ ThemeToggle: () => <div>ThemeToggle</div> }))
vi.mock('@/features/settings/MemberSection', () => ({ MemberSection: () => <div>MemberSection</div> }))
vi.mock('@/features/google/GoogleAccountsSettings', () => ({ GoogleAccountsSettings: () => <div>GoogleAccountsSettings</div> }))
vi.mock('@/features/google/CalendarSection', () => ({ CalendarSection: () => <div>CalendarSection</div> }))
vi.mock('@/features/google/TaskListSection', () => ({ TaskListSection: () => <div>TaskListSection</div> }))
vi.mock('@/features/settings/ChangePinDialog', () => ({
  ChangePinDialog: ({ onClose }: { onClose: () => void }) => (
    <div>ChangePinDialog<button onClick={onClose}>CloseChangePin</button></div>
  ),
}))

import { SettingsView } from './SettingsView'

function renderView() {
  return render(<MemoryRouter><SettingsView /></MemoryRouter>)
}

describe('SettingsView', () => {
  it('renders the four sections and the theme toggle', () => {
    renderView()
    expect(screen.getByText('MemberSection')).toBeInTheDocument()
    expect(screen.getByText('GoogleAccountsSettings')).toBeInTheDocument()
    expect(screen.getByText('CalendarSection')).toBeInTheDocument()
    expect(screen.getByText('TaskListSection')).toBeInTheDocument()
    expect(screen.getByText('ThemeToggle')).toBeInTheDocument()
  })

  it('opens and closes the ChangePinDialog', () => {
    renderView()
    fireEvent.click(screen.getByRole('button', { name: 'PIN ändern' }))
    expect(screen.getByText('ChangePinDialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CloseChangePin' }))
    expect(screen.queryByText('ChangePinDialog')).not.toBeInTheDocument()
  })
})
