import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecurrenceFields } from './RecurrenceFields'
import { EMPTY_RECURRENCE, type RecurrenceState } from './recurrence'

const eventDate = new Date(2026, 6, 21) // Tuesday, 21 July 2026

function Controlled({ onChange }: { onChange: (s: RecurrenceState) => void }) {
  const [state, setState] = useState<RecurrenceState>(EMPTY_RECURRENCE)
  return (
    <RecurrenceFields
      state={state}
      eventDate={eventDate}
      onChange={(next) => {
        onChange(next)
        setState(next)
      }}
    />
  )
}

describe('RecurrenceFields', () => {
  it('shows only the frequency select when frequency is none', () => {
    render(<RecurrenceFields state={EMPTY_RECURRENCE} onChange={vi.fn()} eventDate={eventDate} />)
    expect(screen.getByLabelText('Wiederholung')).toBeInTheDocument()
    expect(screen.queryByLabelText('Intervall')).not.toBeInTheDocument()
    expect(screen.queryByText('Wochentage')).not.toBeInTheDocument()
    expect(screen.queryByText('Ende')).not.toBeInTheDocument()
  })

  it('reveals interval, pre-checked weekday chips and end options when switching to weekly', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Wiederholung'), 'Wöchentlich')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'weekly', weekdays: ['TU'] }))
    expect(screen.getByLabelText('Intervall')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Di' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mo' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Ende')).toBeInTheDocument()
  })

  it('does not touch weekdays when changing frequency to a non-weekly one', async () => {
    const onChange = vi.fn()
    const weekly: RecurrenceState = { frequency: 'weekly', interval: 1, weekdays: ['MO'], end: { type: 'never' } }
    render(<RecurrenceFields state={weekly} onChange={onChange} eventDate={eventDate} />)
    await userEvent.selectOptions(screen.getByLabelText('Wiederholung'), 'Täglich')
    expect(onChange).toHaveBeenCalledWith({ ...weekly, frequency: 'daily' })
  })

  it('selects the "Nie" end option', async () => {
    const onChange = vi.fn()
    const untilState: RecurrenceState = {
      frequency: 'daily',
      interval: 1,
      weekdays: [],
      end: { type: 'until', date: '2026-08-01' },
    }
    render(<RecurrenceFields state={untilState} onChange={onChange} eventDate={eventDate} />)
    await userEvent.click(screen.getByLabelText('Nie'))
    expect(onChange).toHaveBeenCalledWith({ ...untilState, end: { type: 'never' } })
  })

  it('toggles a weekday chip and calls onChange with the updated list', async () => {
    const onChange = vi.fn()
    const weekly: RecurrenceState = { frequency: 'weekly', interval: 1, weekdays: ['TU'], end: { type: 'never' } }
    render(<RecurrenceFields state={weekly} onChange={onChange} eventDate={eventDate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mo' }))
    expect(onChange).toHaveBeenCalledWith({ ...weekly, weekdays: ['TU', 'MO'] })
  })

  it('removes a weekday chip when toggled off', async () => {
    const onChange = vi.fn()
    const weekly: RecurrenceState = { frequency: 'weekly', interval: 1, weekdays: ['TU', 'MO'], end: { type: 'never' } }
    render(<RecurrenceFields state={weekly} onChange={onChange} eventDate={eventDate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mo' }))
    expect(onChange).toHaveBeenCalledWith({ ...weekly, weekdays: ['TU'] })
  })

  it('changes the interval', async () => {
    const onChange = vi.fn()
    const daily: RecurrenceState = { frequency: 'daily', interval: 1, weekdays: [], end: { type: 'never' } }
    render(<RecurrenceFields state={daily} onChange={onChange} eventDate={eventDate} />)
    fireEvent.change(screen.getByLabelText('Intervall'), { target: { value: '3' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...daily, interval: 3 })
  })

  it('selects the "Am" end option and reports an until end', async () => {
    const onChange = vi.fn()
    const daily: RecurrenceState = { frequency: 'daily', interval: 1, weekdays: [], end: { type: 'never' } }
    render(<RecurrenceFields state={daily} onChange={onChange} eventDate={eventDate} />)
    await userEvent.click(screen.getByLabelText('Am'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ end: { type: 'until', date: expect.any(String) } }),
    )
  })

  it('changing the until date updates the end date', async () => {
    const onChange = vi.fn()
    const untilState: RecurrenceState = {
      frequency: 'daily',
      interval: 1,
      weekdays: [],
      end: { type: 'until', date: '2026-08-01' },
    }
    render(<RecurrenceFields state={untilState} onChange={onChange} eventDate={eventDate} />)
    fireEvent.change(screen.getByLabelText('Enddatum'), { target: { value: '2026-09-15' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...untilState, end: { type: 'until', date: '2026-09-15' } })
  })

  it('selects the "Nach" end option and reports a count end', async () => {
    const onChange = vi.fn()
    const daily: RecurrenceState = { frequency: 'daily', interval: 1, weekdays: [], end: { type: 'never' } }
    render(<RecurrenceFields state={daily} onChange={onChange} eventDate={eventDate} />)
    await userEvent.click(screen.getByLabelText('Nach'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ end: { type: 'count', count: expect.any(Number) } }),
    )
  })

  it('changing the count updates the end count', async () => {
    const onChange = vi.fn()
    const countState: RecurrenceState = { frequency: 'daily', interval: 1, weekdays: [], end: { type: 'count', count: 5 } }
    render(<RecurrenceFields state={countState} onChange={onChange} eventDate={eventDate} />)
    fireEvent.change(screen.getByLabelText('Anzahl Termine'), { target: { value: '8' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...countState, end: { type: 'count', count: 8 } })
  })

  it('falls back to 1 when the interval is cleared to an invalid value', () => {
    const onChange = vi.fn()
    const daily: RecurrenceState = { frequency: 'daily', interval: 3, weekdays: [], end: { type: 'never' } }
    render(<RecurrenceFields state={daily} onChange={onChange} eventDate={eventDate} />)
    fireEvent.change(screen.getByLabelText('Intervall'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...daily, interval: 1 })
  })

  it('falls back to 1 when the count is cleared to an invalid value', () => {
    const onChange = vi.fn()
    const countState: RecurrenceState = { frequency: 'daily', interval: 1, weekdays: [], end: { type: 'count', count: 5 } }
    render(<RecurrenceFields state={countState} onChange={onChange} eventDate={eventDate} />)
    fireEvent.change(screen.getByLabelText('Anzahl Termine'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...countState, end: { type: 'count', count: 1 } })
  })

  it('has touch-sized weekday chips', () => {
    const weekly: RecurrenceState = { frequency: 'weekly', interval: 1, weekdays: ['MO'], end: { type: 'never' } }
    render(<RecurrenceFields state={weekly} onChange={vi.fn()} eventDate={eventDate} />)
    expect(screen.getByRole('button', { name: 'Mo' })).toHaveClass('min-h-[44px]')
  })
})
