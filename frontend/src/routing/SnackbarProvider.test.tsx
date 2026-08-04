import { describe, it, expect, vi } from 'vitest'
import { render, renderHook, screen, fireEvent, act } from '@testing-library/react'
import { SnackbarProvider, useSnackbar } from './SnackbarProvider'

// Captures the context API so tests can drive show()/dismiss() imperatively.
let api: ReturnType<typeof useSnackbar>
function Capture() {
  api = useSnackbar()
  return null
}

function renderProvider() {
  return render(
    <SnackbarProvider>
      <Capture />
    </SnackbarProvider>,
  )
}

describe('SnackbarProvider', () => {
  it('throws when useSnackbar is used outside a provider', () => {
    expect(() => renderHook(() => useSnackbar())).toThrow(
      'useSnackbar must be used within a SnackbarProvider',
    )
  })

  it('shows a snackbar with message and action button', () => {
    renderProvider()
    const onClick = vi.fn()
    act(() => api.show({ id: 'a', message: 'Hallo', action: { label: 'Tun', onClick } }))
    expect(screen.getByText('Hallo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tun' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows a snackbar without an action button', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Nur Text' }))
    expect(screen.getByText('Nur Text')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tun' })).not.toBeInTheDocument()
    // The close button is always present.
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument()
  })

  it('dedupes by id: showing the same id twice keeps one snackbar', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Eins' }))
    act(() => api.show({ id: 'a', message: 'Zwei' }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Eins')).toBeInTheDocument()
    expect(screen.queryByText('Zwei')).not.toBeInTheDocument()
  })

  it('stacks distinct snackbars', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'A' }))
    act(() => api.show({ id: 'b', message: 'B' }))
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('closing a snackbar via the X removes it', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Weg damit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByText('Weg damit')).not.toBeInTheDocument()
  })

  it('dismissing an unknown id is a no-op', () => {
    renderProvider()
    act(() => api.show({ id: 'a', message: 'Bleibt' }))
    act(() => api.dismiss('does-not-exist'))
    expect(screen.getByText('Bleibt')).toBeInTheDocument()
  })
})
