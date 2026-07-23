import { vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('./compressImage', async () => {
  const actual = await vi.importActual<typeof import('./compressImage')>('./compressImage')
  return { ...actual, compressImage: vi.fn() }
})
vi.mock('./useMembersQuery', () => ({ useUploadAvatarMutation: vi.fn() }))

import { compressImage, ImageValidationError } from './compressImage'
import { useUploadAvatarMutation } from './useMembersQuery'
import { AvatarUpload } from './AvatarUpload'

function selectFile() {
  const input = screen.getByLabelText('Avatar auswählen') as HTMLInputElement
  const file = new File(['x'], 'a.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('AvatarUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview' })
    vi.mocked(useUploadAvatarMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useUploadAvatarMutation>)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('shows a validation error when compression rejects', async () => {
    vi.mocked(compressImage).mockRejectedValue(new ImageValidationError('Bitte wähle eine Bilddatei aus.'))
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    expect(await screen.findByText('Bitte wähle eine Bilddatei aus.')).toBeInTheDocument()
  })

  it('shows the server message on upload failure', async () => {
    vi.mocked(compressImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    vi.mocked(useUploadAvatarMutation).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Das Bild ist zu groß für den Server.')),
    } as unknown as ReturnType<typeof useUploadAvatarMutation>)
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    expect(await screen.findByText('Das Bild ist zu groß für den Server.')).toBeInTheDocument()
  })

  it('uploads and calls onUploaded on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUploadAvatarMutation).mockReturnValue({ mutateAsync } as unknown as ReturnType<typeof useUploadAvatarMutation>)
    vi.mocked(compressImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    const onUploaded = vi.fn()
    render(<AvatarUpload memberId="m1" onUploaded={onUploaded} />)
    selectFile()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', blob: expect.any(Blob) }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
  })

  it('ignores an empty file selection', () => {
    render(<AvatarUpload memberId="m1" />)
    const input = screen.getByLabelText('Avatar auswählen') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(compressImage).not.toHaveBeenCalled()
  })

  // Extra branch coverage tests

  it('shows generic error when compressImage rejects with a non-Error value', async () => {
    vi.mocked(compressImage).mockRejectedValue('boom')
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    expect(await screen.findByText('Fehler beim Verarbeiten des Bildes.')).toBeInTheDocument()
  })

  it('succeeds without calling onUploaded when prop is not provided', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useUploadAvatarMutation).mockReturnValue({ mutateAsync } as unknown as ReturnType<typeof useUploadAvatarMutation>)
    vi.mocked(compressImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    render(<AvatarUpload memberId="m1" />)
    selectFile()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 'm1', blob: expect.any(Blob) }))
    // No onUploaded prop — optional chaining skips the call; no assertion needed, just confirm no error
    expect(screen.queryByRole('paragraph')).toBeNull()
  })

  it('shows existing avatar image when currentAvatarUrl is provided', () => {
    render(<AvatarUpload memberId="m1" currentAvatarUrl="https://example.com/avatar.jpg" />)
    expect(screen.getByAltText('Avatar-Vorschau')).toBeInTheDocument()
    expect(screen.queryByText('Kein Bild')).not.toBeInTheDocument()
  })

  it('shows "Kein Bild" placeholder when no currentAvatarUrl is provided', () => {
    render(<AvatarUpload memberId="m1" />)
    expect(screen.getByText('Kein Bild')).toBeInTheDocument()
    expect(screen.queryByAltText('Avatar-Vorschau')).not.toBeInTheDocument()
  })
})
