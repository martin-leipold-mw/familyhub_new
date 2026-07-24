import { useState } from 'react'
import { useCreateCredentialsMutation, useValidateCredentialsMutation } from '@/features/google/useGoogleCredentials'

export function CredentialsStep({ onNext }: { onNext: () => void }) {
  const createMutation = useCreateCredentialsMutation()
  const validateMutation = useValidateCredentialsMutation()

  const [nickname, setNickname] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(window.location.origin + '/oauth/callback')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allFilled = nickname.trim() !== '' && clientId.trim() !== '' && clientSecret.trim() !== '' && redirectUri.trim() !== ''

  async function handleValidate() {
    setValidationMessage(null)
    setIsValid(null)
    try {
      const result = await validateMutation.mutateAsync({ data: { clientId, clientSecret, redirectUri } })
      setIsValid(result.data.isValid)
      setValidationMessage(result.data.message ?? (result.data.isValid ? 'Verbindung erfolgreich.' : 'Verbindung fehlgeschlagen.'))
    } catch (err) {
      setIsValid(false)
      setValidationMessage(err instanceof Error ? err.message : 'Validierung fehlgeschlagen.')
    }
  }

  async function handleSave() {
    setError(null)
    try {
      await createMutation.mutateAsync({ data: { nickname, clientId, clientSecret, redirectUri } })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldedaten konnten nicht gespeichert werden.')
    }
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      <h1 className="text-2xl font-bold text-center">OAuth-Anmeldedaten eingeben</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="nickname" className="text-sm text-slate-300">
          Nickname
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="rounded-lg bg-slate-700 px-3 py-2 text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="z. B. Familie Müller"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="client-id" className="text-sm text-slate-300">
          Client-ID
        </label>
        <input
          id="client-id"
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-lg bg-slate-700 px-3 py-2 text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="xxxxx.apps.googleusercontent.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="client-secret" className="text-sm text-slate-300">
          Client-Secret
        </label>
        <input
          id="client-secret"
          type="text"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className="rounded-lg bg-slate-700 px-3 py-2 text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="GOCSPX-..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="redirect-uri" className="text-sm text-slate-300">
          Redirect-URI
        </label>
        <input
          id="redirect-uri"
          type="text"
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          className="rounded-lg bg-slate-700 px-3 py-2 text-white min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {validationMessage && (
        <p className={`text-sm text-center ${isValid ? 'text-green-400' : 'text-red-400'}`}>
          {validationMessage}
        </p>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        type="button"
        disabled={!allFilled}
        onClick={handleValidate}
        className="min-h-[44px] rounded-xl bg-slate-600 text-white disabled:opacity-50"
      >
        Verbindung testen
      </button>

      <button
        type="button"
        disabled={!allFilled}
        onClick={handleSave}
        className="min-h-[44px] rounded-xl bg-blue-500 text-white disabled:opacity-50"
      >
        Speichern &amp; weiter
      </button>
    </div>
  )
}
