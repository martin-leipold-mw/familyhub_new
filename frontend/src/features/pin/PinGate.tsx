import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePinSession } from './PinSessionContext'
import { useVerifyPin } from '@/api/generated/endpoints/familyHubAPI'
import { PinInputDialog } from './PinInputDialog'

export function PinGate({ children }: { children: ReactNode }) {
  const { hasPinSession, setSession } = usePinSession()
  const verifyPin = useVerifyPin()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function verify(pin: string) {
    setError(null)
    try {
      const result = await verifyPin.mutateAsync({ data: { pin } })
      setSession(result.data.sessionToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falsche PIN.')
    }
  }

  if (hasPinSession) return <>{children}</>

  return (
    <div className="min-h-screen bg-bg text-primary">
      <PinInputDialog
        title="PIN eingeben"
        error={error}
        cancelLabel="← Zum Kalender"
        onSubmit={verify}
        onCancel={() => navigate('/')}
      />
    </div>
  )
}
