import { useStartGoogleAuth } from '@/features/google/useCalendars'

// `onNext` is intentionally unused: this step redirects to Google via
// window.location.href, and progression is handled by the OAuth callback +
// wizard resume when the user returns. The prop is kept for interface uniformity.
export function ConnectStep({ onNext: _onNext }: { onNext: () => void }) {
  const startAuth = useStartGoogleAuth()

  async function handleConnect() {
    const authUrl = await startAuth.mutateAsync({ returnUrl: '/setup' })
    window.location.href = authUrl
  }

  return (
    <div className="flex flex-col gap-6 text-white text-center">
      <h1 className="text-2xl font-bold">Mit Google verbinden</h1>
      <p className="text-slate-300">
        Du wirst jetzt zu Google weitergeleitet, um FamilyHub den Zugriff auf deinen Kalender zu
        erlauben. Nach der Bestätigung kehrst du automatisch hierher zurück.
      </p>
      <button
        type="button"
        onClick={handleConnect}
        className="mx-auto min-h-[44px] rounded-xl bg-blue-500 px-6 py-3 text-white"
      >
        Mit Google verbinden
      </button>
    </div>
  )
}
