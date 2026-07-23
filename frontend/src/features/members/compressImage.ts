export class ImageValidationError extends Error {}

const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_OUTPUT_BYTES = 500 * 1024

const ERR_NOT_IMAGE = 'Bitte wähle eine Bilddatei aus.'
const ERR_TOO_LARGE = 'Das Bild ist zu groß. Bitte wähle ein kleineres Bild.'
const ERR_COMPRESS = 'Das Bild konnte nicht ausreichend komprimiert werden.'
const ERR_CANVAS = 'Fehler beim Verarbeiten des Bildes.'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new ImageValidationError(ERR_CANVAS))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new ImageValidationError(ERR_CANVAS))
    image.src = dataUrl
  })
}

export async function compressImage(file: File, maxEdge = 512, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageValidationError(ERR_NOT_IMAGE)
  if (file.size > MAX_INPUT_BYTES) throw new ImageValidationError(ERR_TOO_LARGE)

  const dataUrl = await fileToDataUrl(file)
  const image = await loadImage(dataUrl)

  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageValidationError(ERR_CANVAS)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new ImageValidationError(ERR_CANVAS)
  if (blob.size > MAX_OUTPUT_BYTES) throw new ImageValidationError(ERR_COMPRESS)
  return blob
}
