import { useState } from 'react'
import { compressImage, ImageValidationError } from './compressImage'
import { useUploadAvatarMutation } from './useMembersQuery'

export function AvatarUpload({
  memberId,
  currentAvatarUrl,
  onUploaded,
}: {
  memberId: string
  currentAvatarUrl?: string | null
  onUploaded?: () => void
}) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const upload = useUploadAvatarMutation()

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const blob = await compressImage(file)
      setPreview(URL.createObjectURL(blob))
      await upload.mutateAsync({ id: memberId, blob })
      onUploaded?.()
    } catch (err) {
      if (err instanceof ImageValidationError) setError(err.message)
      else if (err instanceof Error) setError(err.message)
      else setError('Fehler beim Verarbeiten des Bildes.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">
        {preview ? (
          <img src={preview} alt="Avatar-Vorschau" className="w-full h-full object-cover" />
        ) : (
          <span className="text-slate-400 text-sm">Kein Bild</span>
        )}
      </span>
      <label className="cursor-pointer rounded-xl bg-slate-700 px-4 py-3 text-white min-h-[44px] flex items-center">
        Bild auswählen
        <input
          type="file"
          accept="image/*"
          aria-label="Avatar auswählen"
          className="hidden"
          onChange={handleFile}
        />
      </label>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  )
}
