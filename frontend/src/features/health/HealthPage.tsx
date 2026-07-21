import { useGetHealth } from '@/api/generated/endpoints/familyHubAPI'

export default function HealthPage() {
  const { data, isLoading, isError } = useGetHealth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <p className="text-xl">Verbinde mit Server…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-red-400">
        <p className="text-xl">Server nicht erreichbar</p>
      </div>
    )
  }

  const { status, version } = data.data

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">FamilyHub</h1>
        <div className="flex items-center gap-2 justify-center">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              status === 'UP' ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span className="text-lg">
            System {status === 'UP' ? 'bereit' : 'nicht verfügbar'}
          </span>
        </div>
        <p className="text-slate-400 text-sm">Version: {version}</p>
      </div>
    </div>
  )
}
