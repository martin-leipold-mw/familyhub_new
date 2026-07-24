import { useState } from 'react'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
]

const CHECKLIST = [
  'Ich habe ein Google Cloud-Projekt erstellt.',
  'Ich habe die OAuth-Zustimmungsseite konfiguriert.',
  null, // redirect URI — rendered separately
  'Ich habe OAuth-Client-Anmeldedaten (Desktop oder Web) erstellt.',
]

export function GoogleGuideStep({ onNext }: { onNext: () => void }) {
  const [checked, setChecked] = useState([false, false, false, false])

  const redirectUri = window.location.origin + '/oauth/callback'

  const allChecked = checked.every(Boolean)

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  const labels = [
    CHECKLIST[0]!,
    CHECKLIST[1]!,
    // index 2 handled specially
    'Ich habe OAuth-Client-Anmeldedaten (Desktop oder Web) erstellt.',
  ]

  return (
    <div className="flex flex-col gap-6 text-white">
      <h1 className="text-2xl font-bold text-center">Google-Konto verbinden</h1>
      <p className="text-slate-300">
        Um Google Kalender zu synchronisieren, benötigst du eigene OAuth-Anmeldedaten aus der Google
        Cloud Console. Bitte stelle sicher, dass du folgende Schritte abgeschlossen hast:
      </p>

      <ul className="flex flex-col gap-3">
        {/* Checkbox 0 */}
        <li className="flex items-start gap-3">
          <input
            type="checkbox"
            id="check-0"
            checked={checked[0]}
            onChange={() => toggle(0)}
            className="mt-1 w-5 h-5 accent-blue-500 cursor-pointer"
          />
          <label htmlFor="check-0" className="cursor-pointer leading-snug">
            Ich habe ein Google Cloud-Projekt erstellt.
          </label>
        </li>

        {/* Checkbox 1 */}
        <li className="flex items-start gap-3">
          <input
            type="checkbox"
            id="check-1"
            checked={checked[1]}
            onChange={() => toggle(1)}
            className="mt-1 w-5 h-5 accent-blue-500 cursor-pointer"
          />
          <label htmlFor="check-1" className="cursor-pointer leading-snug">
            Ich habe die OAuth-Zustimmungsseite konfiguriert.
          </label>
        </li>

        {/* Checkbox 2 — redirect URI */}
        <li className="flex items-start gap-3">
          <input
            type="checkbox"
            id="check-2"
            checked={checked[2]}
            onChange={() => toggle(2)}
            className="mt-1 w-5 h-5 accent-blue-500 cursor-pointer"
          />
          <label htmlFor="check-2" className="cursor-pointer leading-snug">
            Ich habe folgende Redirect-URI hinzugefügt:{' '}
            <code className="text-blue-300 font-mono text-sm bg-slate-800 px-1 rounded">
              {redirectUri}
            </code>
          </label>
        </li>

        {/* Checkbox 3 */}
        <li className="flex items-start gap-3">
          <input
            type="checkbox"
            id="check-3"
            checked={checked[3]}
            onChange={() => toggle(3)}
            className="mt-1 w-5 h-5 accent-blue-500 cursor-pointer"
          />
          <label htmlFor="check-3" className="cursor-pointer leading-snug">
            Ich habe OAuth-Client-Anmeldedaten (Desktop oder Web) erstellt.
          </label>
        </li>
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-slate-400 text-sm">Benötigte Berechtigungen (Scopes):</p>
        <ul className="flex flex-col gap-1">
          {SCOPES.map((scope) => (
            <li key={scope}>
              <code className="text-blue-300 font-mono text-xs bg-slate-800 px-2 py-0.5 rounded">
                {scope}
              </code>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        disabled={!allChecked}
        onClick={onNext}
        className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
      >
        Weiter →
      </button>
    </div>
  )
}
