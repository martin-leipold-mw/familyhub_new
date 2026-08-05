import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useGetSetupStatus } from '@/api/generated/endpoints/familyHubAPI'

function FullScreen({ children, tone }: { children: ReactNode; tone: 'info' | 'error' }) {
  return (
    <div
      className={`flex items-center justify-center min-h-screen bg-bg ${
        tone === 'error' ? 'text-danger' : 'text-primary'
      }`}
    >
      <p className="text-xl">{children}</p>
    </div>
  )
}

export function SetupGuard({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGetSetupStatus()

  if (isLoading) return <FullScreen tone="info">Lädt …</FullScreen>
  if (isError || !data) return <FullScreen tone="error">Server nicht erreichbar</FullScreen>
  if (!data.data.setupCompleted) return <Navigate to="/setup" replace />
  return <>{children}</>
}
