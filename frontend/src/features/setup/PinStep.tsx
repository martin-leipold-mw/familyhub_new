import { useState } from 'react'
import { useSetPin } from '@/api/generated/endpoints/familyHubAPI'
import { usePinSession } from '@/features/pin/PinSessionContext'
import { PinInputDialog } from '@/features/pin/PinInputDialog'
import { redirectHome } from './redirectHome'

export function PinStep({ onDone }: { onDone?: () => void }) {
  const setPin = useSetPin()
  const { setSession } = usePinSession()
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function confirm(secondPin: string) {
    if (secondPin !== firstPin) {
      setError('Die PINs stimmen nicht überein.')
      setFirstPin(null)
      return
    }
    try {
      const result = await setPin.mutateAsync({ data: { pin: secondPin } })
      setSession(result.data.sessionToken)
      onDone?.()
      redirectHome()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht gesetzt werden.')
      setFirstPin(null)
    }
  }

  if (firstPin === null) {
    return (
      <PinInputDialog
        key="vergeben"
        title="PIN vergeben"
        error={error}
        onSubmit={(pin) => {
          setError(null)
          setFirstPin(pin)
        }}
        onCancel={() => setError(null)}
      />
    )
  }

  return (
    <PinInputDialog
      key="bestaetigen"
      title="PIN bestätigen"
      error={error}
      onSubmit={confirm}
      onCancel={() => setFirstPin(null)}
    />
  )
}
