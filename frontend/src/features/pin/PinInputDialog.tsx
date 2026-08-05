import { useEffect, useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

export function PinInputDialog({
  title,
  error,
  cancelLabel = 'Abbrechen',
  onSubmit,
  onCancel,
}: {
  title: string
  error?: string | null
  cancelLabel?: string
  onSubmit: (pin: string) => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const valid = pin.length >= 4

  function press(key: string) {
    if (key === 'Löschen') setPin('')
    else if (key === '←') setPin((p) => p.slice(0, -1))
    else setPin((p) => (p.length < 6 ? p + key : p))
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') {
        if (pin.length >= 4) onSubmit(pin)
      } else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pin, onSubmit, onCancel])

  return (
    <div
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xs rounded-2xl bg-surface p-6 flex flex-col gap-4">
        <h2 className="text-xl font-bold text-primary text-center">{title}</h2>
        <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-surface-2'}`}
            />
          ))}
        </div>
        {error && <p className="text-danger text-sm text-center">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => press(key)}
              className="min-h-[56px] rounded-xl bg-surface-2 text-primary text-lg"
            >
              {key}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl bg-surface-2 text-primary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit(pin)}
            className="flex-1 min-h-[44px] rounded-xl bg-accent text-white disabled:opacity-50"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  )
}
