import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurrentTimeLine } from './CurrentTimeLine'

describe('CurrentTimeLine', () => {
  it('renders a line inside visible hours', () => {
    render(<CurrentTimeLine now={new Date(2026, 6, 21, 12, 0)} />)
    const line = screen.getByTestId('current-time-line')
    expect(line).toHaveStyle({ top: '300px' })
  })
  it('renders nothing outside visible hours', () => {
    render(<CurrentTimeLine now={new Date(2026, 6, 21, 23, 0)} />)
    expect(screen.queryByTestId('current-time-line')).toBeNull()
  })
})
