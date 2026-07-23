import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/api/generated/endpoints/familyHubAPI', () => ({ useChangePin: vi.fn() }))
import { useChangePin } from '@/api/generated/endpoints/familyHubAPI'
import { ChangePinDialog } from './ChangePinDialog'

function enter(pin: string) {
  for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }))
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
}

describe('ChangePinDialog', () => {
  it('walks current → new → confirm and calls changePin', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync } as never)
    const onClose = vi.fn()
    render(<ChangePinDialog onClose={onClose} />)

    expect(screen.getByText('Aktuelle PIN')).toBeInTheDocument()
    enter('1234')
    expect(screen.getByText('Neue PIN')).toBeInTheDocument()
    enter('5678')
    expect(screen.getByText('Neue PIN bestätigen')).toBeInTheDocument()
    enter('5678')

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ data: { currentPin: '1234', newPin: '5678' } }),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows an error when confirmation does not match', () => {
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync: vi.fn() } as never)
    render(<ChangePinDialog onClose={() => {}} />)
    enter('1234')
    enter('5678')
    enter('0000')
    expect(screen.getByText('Die neuen PINs stimmen nicht überein.')).toBeInTheDocument()
  })

  it('shows error message from Error instance on changePin failure', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Falscher Code'))
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync } as never)
    render(<ChangePinDialog onClose={() => {}} />)
    enter('1234')
    enter('5678')
    enter('5678')
    await waitFor(() => expect(screen.getByText('Falscher Code')).toBeInTheDocument())
  })

  it('shows fallback error message when thrown value is not an Error', async () => {
    const mutateAsync = vi.fn().mockRejectedValue('oops')
    vi.mocked(useChangePin).mockReturnValue({ mutateAsync } as never)
    render(<ChangePinDialog onClose={() => {}} />)
    enter('1234')
    enter('5678')
    enter('5678')
    await waitFor(() =>
      expect(screen.getByText('PIN konnte nicht geändert werden.')).toBeInTheDocument(),
    )
  })
})
