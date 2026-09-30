import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/testUtils'

vi.mock('./useChores', () => ({ useChores: vi.fn() }))

import { useChores } from './useChores'
import { ChoreSettingsLink } from './ChoreSettingsLink'

describe('ChoreSettingsLink', () => {
  it('fuehrt auf die Unterseite und zaehlt die Aufgaben', () => {
    vi.mocked(useChores).mockReturnValue({
      chores: [{ id: 'c1' }, { id: 'c2' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChores>)

    renderWithProviders(<ChoreSettingsLink />)

    const link = screen.getByRole('link', { name: /Haushalt/ })
    expect(link).toHaveAttribute('href', '/settings/chores')
    expect(link).toHaveTextContent('Haushalt · 2 Aufgaben')
  })

  it('setzt bei genau einer Aufgabe die Einzahl', () => {
    vi.mocked(useChores).mockReturnValue({
      chores: [{ id: 'c1' }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChores>)

    renderWithProviders(<ChoreSettingsLink />)

    expect(screen.getByRole('link', { name: /Haushalt/ })).toHaveTextContent('Haushalt · 1 Aufgabe')
  })
})
