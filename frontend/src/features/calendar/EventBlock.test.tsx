import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventBlock } from './EventBlock'

describe('EventBlock', () => {
  it('renders title, applies member color, and fires onClick', async () => {
    const onClick = vi.fn()
    render(
      <EventBlock
        title="Schule"
        timeLabel="09:00"
        colorHex="hsl(140 60% 65%)"
        top={150}
        height={50}
        leftPct={0}
        widthPct={100}
        onClick={onClick}
      />,
    )
    const btn = screen.getByRole('button', { name: /Schule/ })
    expect(btn).toHaveStyle({ backgroundColor: 'hsl(140 60% 65%)' })
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
