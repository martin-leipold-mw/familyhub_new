import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinInputDialog } from './PinInputDialog'

function typeDigits(digits: string) {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }))
}

describe('PinInputDialog', () => {
  it('keeps confirm disabled below 4 digits', () => {
    render(<PinInputDialog title="PIN eingeben" onSubmit={() => {}} onCancel={() => {}} />)
    typeDigits('123')
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled()
  })

  it('submits a valid 4-digit pin', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('backspace removes the last digit', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('12345')
    fireEvent.click(screen.getByRole('button', { name: '←' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('clear empties the entry', () => {
    render(<PinInputDialog title="PIN eingeben" onSubmit={() => {}} onCancel={() => {}} />)
    typeDigits('1234')
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled()
  })

  it('does not exceed 6 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    typeDigits('1234567')
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
    expect(onSubmit).toHaveBeenCalledWith('123456')
  })

  it('renders an error and cancels', () => {
    const onCancel = vi.fn()
    render(<PinInputDialog title="PIN eingeben" error="Falsche PIN" onSubmit={() => {}} onCancel={onCancel} />)
    expect(screen.getByText('Falsche PIN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('accepts digits and Enter from the physical keyboard', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '1234') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('Enter does nothing below 4 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '12') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Backspace deletes the last keyboard digit', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '12345') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('1234')
  })

  it('keyboard entry caps at 6 digits', () => {
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={() => {}} />)
    for (const d of '1234567') fireEvent.keyDown(window, { key: d })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('123456')
  })

  it('Escape triggers onCancel; unrelated keys are ignored', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    render(<PinInputDialog title="PIN eingeben" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'a' }) // ignored, no throw
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders a custom cancel label', () => {
    render(<PinInputDialog title="PIN eingeben" cancelLabel="← Zum Kalender" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: '← Zum Kalender' })).toBeInTheDocument()
  })
})
