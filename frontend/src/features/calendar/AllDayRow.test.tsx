import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AllDayRow } from './AllDayRow'

describe('AllDayRow', () => {
  it('renders a chip per all-day event in its column', () => {
    render(
      <AllDayRow
        columns={[
          [{ id: 'a', title: 'Urlaub Papa', colorHex: '#123', onClick: vi.fn() }],
          [],
        ]}
      />,
    )
    expect(screen.getByText('Urlaub Papa')).toBeInTheDocument()
  })

  it('renders the chip as a labelled button that fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <AllDayRow
        columns={[[{ id: 'a', title: 'Urlaub Papa', colorHex: '#123', onClick }]]}
      />,
    )
    const chip = screen.getByRole('button', { name: 'Urlaub Papa' })
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
