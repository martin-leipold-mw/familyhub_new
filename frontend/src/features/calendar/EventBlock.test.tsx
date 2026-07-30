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

  it('shows a series marker when recurring', () => {
    render(
      <EventBlock
        title="Sport"
        colorHex="#f00"
        top={0}
        height={40}
        leftPct={0}
        widthPct={100}
        onClick={() => {}}
        isRecurring
      />,
    )
    expect(screen.getByLabelText('Serie')).toBeInTheDocument()
  })

  it('does not show a series marker when not recurring', () => {
    render(
      <EventBlock
        title="Sport"
        colorHex="#f00"
        top={0}
        height={40}
        leftPct={0}
        widthPct={100}
        onClick={() => {}}
      />,
    )
    expect(screen.queryByLabelText('Serie')).toBeNull()
  })
})
