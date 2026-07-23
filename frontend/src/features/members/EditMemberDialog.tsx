import { useState } from 'react'
import type { MemberResponse } from '@/api/generated/model'
import { MemberForm, type MemberFormValues } from './MemberForm'
import { AvatarUpload } from './AvatarUpload'
import { useUpdateMemberMutation, useDeleteMemberMutation } from './useMembersQuery'
import type { MemberColor, MemberRole } from './colors'

export function EditMemberDialog({
  member,
  onClose,
}: {
  member: MemberResponse
  onClose: () => void
}) {
  const update = useUpdateMemberMutation()
  const remove = useDeleteMemberMutation()
  const [error, setError] = useState<string | null>(null)

  async function submit(values: MemberFormValues) {
    setError(null)
    try {
      await update.mutateAsync({
        id: member.id,
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

  async function deleteMember() {
    setError(null)
    try {
      await remove.mutateAsync({ id: member.id })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entfernen fehlgeschlagen.')
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Mitglied bearbeiten"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-800 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Mitglied bearbeiten</h2>
        <div className="mb-4">
          <AvatarUpload memberId={member.id} currentAvatarUrl={member.avatarUrl} />
        </div>
        <MemberForm
          initial={{
            name: member.name,
            role: member.role as MemberRole,
            color: member.color as MemberColor,
            dateOfBirth: member.dateOfBirth ?? '',
          }}
          submitLabel="Aktualisieren"
          isSubmitting={update.isPending}
          error={error}
          onSubmit={submit}
          onCancel={onClose}
        />
        <button
          type="button"
          onClick={deleteMember}
          className="mt-4 w-full rounded-xl px-4 py-3 min-h-[44px] bg-red-600 text-white"
        >
          Entfernen
        </button>
      </div>
    </div>
  )
}
