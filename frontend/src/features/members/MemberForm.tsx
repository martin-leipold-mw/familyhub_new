import { useState } from 'react'
import { MEMBER_COLORS, MEMBER_COLOR_KEYS, type MemberColor, type MemberRole } from './colors'

export interface MemberFormValues {
  name: string
  role: MemberRole
  color: MemberColor
  dateOfBirth: string
}

const DEFAULTS: MemberFormValues = { name: '', role: 'child', color: 'blue', dateOfBirth: '' }

export function MemberForm({
  initial,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<MemberFormValues>
  submitLabel: string
  isSubmitting?: boolean
  error?: string | null
  onSubmit: (values: MemberFormValues) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<MemberFormValues>({ ...DEFAULTS, ...initial })
  const [nameError, setNameError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const name = values.name.trim()
    if (name.length < 2) {
      setNameError('Bitte gib einen Namen mit mindestens 2 Zeichen ein.')
      return
    }
    setNameError(null)
    onSubmit({ ...values, name })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-white">
        Name
        <input
          aria-label="Name"
          className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </label>
      {nameError && <p className="text-red-400 text-sm">{nameError}</p>}

      <fieldset className="flex gap-4 text-white">
        <legend className="mb-1">Rolle</legend>
        {(['parent', 'child'] as MemberRole[]).map((role) => (
          <label key={role} className="flex items-center gap-2 min-h-[44px]">
            <input
              type="radio"
              name="role"
              checked={values.role === role}
              onChange={() => setValues({ ...values, role })}
            />
            {role === 'parent' ? 'Elternteil' : 'Kind'}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1 text-white">
        <span>Farbe</span>
        <div className="flex gap-2 flex-wrap">
          {MEMBER_COLOR_KEYS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={values.color === color}
              onClick={() => setValues({ ...values, color })}
              className="w-11 h-11 rounded-full"
              style={{
                backgroundColor: MEMBER_COLORS[color],
                outline: values.color === color ? '3px solid white' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-white">
        Geburtstag (optional)
        <input
          type="date"
          aria-label="Geburtstag (optional)"
          className="rounded-lg px-3 py-3 min-h-[44px] text-slate-900"
          value={values.dateOfBirth}
          onChange={(e) => setValues({ ...values, dateOfBirth: e.target.value })}
        />
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-3 min-h-[44px] bg-slate-600 text-white"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl px-4 py-3 min-h-[44px] bg-blue-500 text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
