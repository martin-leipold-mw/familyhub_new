import { useState } from 'react'
import { MemberForm, type MemberFormValues } from './MemberForm'
import { useCreateMemberMutation } from './useMembersQuery'

export function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateMemberMutation()
  const [error, setError] = useState<string | null>(null)

  async function submit(values: MemberFormValues) {
    setError(null)
    try {
      await create.mutateAsync({
        data: {
          name: values.name,
          role: values.role,
          color: values.color,
          dateOfBirth: values.dateOfBirth || undefined,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Mitglied hinzufügen"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-800 p-6">
        <h2 className="text-xl font-bold text-white mb-4">Mitglied hinzufügen</h2>
        <MemberForm
          submitLabel="Anlegen"
          isSubmitting={create.isPending}
          error={error}
          onSubmit={submit}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
