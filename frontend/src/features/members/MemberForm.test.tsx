import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemberForm } from './MemberForm'

describe('MemberForm', () => {
  it('blocks submit when the trimmed name is too short', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' a ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')).toBeInTheDocument()
  })

  it('submits trimmed values', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Anna  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Anna', role: 'child', color: 'blue' }),
    )
  })

  it('prefills from initial values and cancels', () => {
    const onCancel = vi.fn()
    render(
      <MemberForm
        initial={{ name: 'Bea', role: 'parent', color: 'pink', dateOfBirth: '2015-01-01' }}
        submitLabel="Aktualisieren"
        onSubmit={() => {}}
        onCancel={onCancel}
      />,
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Bea')
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MemberForm submitLabel="Speichern" error="Serverfehler" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Serverfehler')).toBeInTheDocument()
  })

  it('does not show error paragraph when error is null', () => {
    render(<MemberForm submitLabel="Speichern" error={null} onSubmit={() => {}} onCancel={() => {}} />)
    // No error paragraph rendered
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
  })

  it('clears name error after a successful submit', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    // First trigger an error
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByText('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')).toBeInTheDocument()
    // Then fix the name and submit
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Max' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.queryByText('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalled()
  })

  it('selects a different color swatch (aria-pressed branch)', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    // Default color is 'blue' (aria-pressed=true); click 'pink' to change
    const pinkButton = screen.getByRole('button', { name: 'pink' })
    expect(pinkButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pinkButton)
    expect(pinkButton).toHaveAttribute('aria-pressed', 'true')
    // blue is now not pressed
    expect(screen.getByRole('button', { name: 'blue' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects parent role (role radio branch)', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByLabelText('Elternteil'))
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ role: 'parent' }))
  })

  it('submits with a dateOfBirth value (non-empty branch)', () => {
    const onSubmit = vi.fn()
    render(<MemberForm submitLabel="Speichern" onSubmit={onSubmit} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Karl' } })
    fireEvent.change(screen.getByLabelText('Geburtstag (optional)'), { target: { value: '2010-05-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: '2010-05-15' }))
  })

  it('disables submit button when isSubmitting is true', () => {
    render(<MemberForm submitLabel="Speichern" isSubmitting={true} onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })
})
