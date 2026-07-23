import { useState } from 'react'
import { useChangePin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from '@/features/pin/PinInputDialog'

type Phase = 'current' | 'next' | 'confirm'

export function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const changePin = useChangePin()
  const [phase, setPhase] = useState<Phase>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submitConfirm(confirmPin: string) {
    if (confirmPin !== newPin) {
      setError('Die neuen PINs stimmen nicht überein.')
      setPhase('next')
      return
    }
    try {
      await changePin.mutateAsync({ data: { currentPin, newPin } })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN konnte nicht geändert werden.')
      setPhase('current')
    }
  }

  if (phase === 'current') {
    return (
      <PinInputDialog
        key="current"
        title="Aktuelle PIN"
        error={error}
        onCancel={onClose}
        onSubmit={(pin) => {
          setError(null)
          setCurrentPin(pin)
          setPhase('next')
        }}
      />
    )
  }
  if (phase === 'next') {
    return (
      <PinInputDialog
        key="next"
        title="Neue PIN"
        error={error}
        onCancel={onClose}
        onSubmit={(pin) => {
          setError(null)
          setNewPin(pin)
          setPhase('confirm')
        }}
      />
    )
  }
  return (
    <PinInputDialog
      key="confirm"
      title="Neue PIN bestätigen"
      error={error}
      onCancel={onClose}
      onSubmit={submitConfirm}
    />
  )
}
