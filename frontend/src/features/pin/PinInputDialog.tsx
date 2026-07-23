import { useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

export function PinInputDialog({
  title,
  error,
  onSubmit,
  onCancel,
}: {
  title: string
  error?: string | null
  onSubmit: (pin: string) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  // Note: brief has `pin.length >= 4 && pin.length <= 6`, but the keypad caps entry
  // at 6 digits (`p.length < 6 ? p + key : p`), so `pin.length <= 6` is always true —
  // its false branch is unreachable dead code that would fail 100%-branch coverage.
  // Simplified to `pin.length >= 4`; behavior is identical.
  const valid = pin.length >= 4

  function press(key: string) {
    if (key === 'Löschen') setPin('')
    else if (key === '←') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < 6 ? p + key : p))
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xs rounded-2xl bg-slate-800 p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white text-center">{title}</h2>
        <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-white' : 'bg-slate-600'}`}
            />
          ))}
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => press(key)}
              className="min-h-[56px] rounded-xl bg-slate-700 text-white text-lg"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl bg-slate-600 text-white"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(pin)}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  )
}
