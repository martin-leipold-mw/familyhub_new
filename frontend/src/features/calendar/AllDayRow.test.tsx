import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
