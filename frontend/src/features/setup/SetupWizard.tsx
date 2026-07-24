import { useEffect, useState } from 'react'
import { useGetSetupStatus, useUpdateSetupStep, useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { WelcomeStep } from './WelcomeStep'
import { MembersStep } from './MembersStep'
import { GoogleGuideStep } from './GoogleGuideStep'
import { CredentialsStep } from './CredentialsStep'
import { ConnectStep } from './ConnectStep'
import { CalendarSelectStep } from './CalendarSelectStep'
import { redirectHome } from './redirectHome'

const TOTAL_STEPS = 7

export function SetupWizard() {
  const status = useGetSetupStatus()
  const updateStep = useUpdateSetupStep()
  const setPin = useSetPin()
  const { setSession } = usePinSession()

  const [step, setStep] = useState(1)
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const resume = status.data?.data.currentStep
    if (resume) setStep(resume)
  }, [status.data])

  async function goToStep(next: number) {
    await updateStep.mutateAsync({ data: { step: next } })
    setStep(next)
  }

  function pressDigit(digit: string) {
    if (digit === 'Löschen') setEntry('')
    else if (digit === '←') setEntry((p) => p.slice(0, -1))
    else setEntry((p) => (p.length < 6 ? p + digit : p))
  }

  async function confirmSecond() {
    if (entry !== firstPin) {
      setError('Die PINs stimmen nicht überein.')
      setFirstPin(null)
      setEntry('')
      return
    }
    try {
      const result = await setPin.mutateAsync({ data: { pin: entry } })
      setSession(result.data.sessionToken)
      redirectHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht gesetzt werden.')
      setFirstPin(null)
      setEntry('')
    }
  }

  // Note: brief has `entry.length >= 4 && entry.length <= 6`, but the keypad caps entry
  // at 6 digits (`p.length < 6 ? p + digit : p`), so `entry.length <= 6` is always true —
  // its false branch is unreachable dead code that would fail 100%-branch coverage.
  // Simplified to `entry.length >= 4`; behavior is identical.
  const valid = entry.length >= 4
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen', '0', '←']

  const progressPercent = Math.round((step / TOTAL_STEPS) * 100) + '%'

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <p className="text-slate-300 mb-2">Schritt {step} von {TOTAL_STEPS}</p>
        <div className="h-2 rounded-full bg-slate-700 mb-8">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: progressPercent }} />
        </div>

        {step === 1 && <WelcomeStep onNext={() => goToStep(2)} />}
        {step === 2 && <MembersStep onNext={() => goToStep(3)} />}
        {step === 3 && <GoogleGuideStep onNext={() => goToStep(4)} />}
        {step === 4 && <CredentialsStep onNext={() => goToStep(5)} />}
        {step === 5 && <ConnectStep onNext={() => goToStep(6)} />}
        {step === 6 && <CalendarSelectStep onNext={() => goToStep(7)} />}
        {step === 7 && (
          <div className="flex flex-col gap-4 text-white">
            <h1 className="text-2xl font-bold text-center">
              {firstPin === null ? 'PIN vergeben' : 'PIN bestätigen'}
            </h1>
            <div className="flex justify-center gap-2" aria-label="PIN-Anzeige">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className={`w-4 h-4 rounded-full ${i < entry.length ? 'bg-white' : 'bg-slate-600'}`} />
              ))}
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => pressDigit(key)}
                  className="min-h-[56px] rounded-xl bg-slate-700 text-white text-lg"
                >
                  {key}
                </button>
              ))}
            </div>
            {firstPin === null ? (
              <button
                type="button"
                disabled={!valid}
                onClick={() => { setFirstPin(entry); setEntry(''); setError(null) }}
                className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
              >
                Weiter zur Bestätigung
              </button>
            ) : (
              <button
                type="button"
                disabled={!valid}
                onClick={confirmSecond}
                className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
              >
                Fertig
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
