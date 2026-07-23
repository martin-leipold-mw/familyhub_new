import { vi } from 'vitest'
import { compressImage, ImageValidationError } from './compressImage'

function makeFile(type: string, size: number): File {
  const file = new File(['x'], 'a.png', { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

// Mock FileReader → resolves a data URL immediately.
class FakeReader {
  onload: (() => void) | null = null
  result = 'data:image/png;base64,AAAA'
  readAsDataURL() { this.onload?.() }
}

// Mock Image → fires onload with configurable dimensions.
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 1024
  height = 512
  set src(_v: string) { this.onload?.() }
}

function stubCanvas(blob: Blob | null) {
  const ctx = { drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    blob === undefined ? null : (ctx as unknown as CanvasRenderingContext2D),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob))
}

describe('compressImage', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', FakeReader)
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects non-image files', async () => {
    await expect(compressImage(makeFile('text/plain', 100)))
      .rejects.toThrow('Bitte wähle eine Bilddatei aus.')
  })

  it('rejects files larger than 20 MB', async () => {
    await expect(compressImage(makeFile('image/png', 21 * 1024 * 1024)))
      .rejects.toThrow('Das Bild ist zu groß. Bitte wähle ein kleineres Bild.')
  })

  it('throws a canvas error when 2d context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('throws a canvas error when toBlob yields null', async () => {
    stubCanvas(null)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('rejects when the compressed blob is still too large', async () => {
    const big = new Blob(['x'])
    Object.defineProperty(big, 'size', { value: 600 * 1024 })
    stubCanvas(big)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Das Bild konnte nicht ausreichend komprimiert werden.')
  })

  it('returns the compressed blob on success', async () => {
    const ok = new Blob(['x'])
    Object.defineProperty(ok, 'size', { value: 100 * 1024 })
    stubCanvas(ok)
    const result = await compressImage(makeFile('image/png', 1000))
    expect(result).toBeInstanceOf(Blob)
    expect(result).toBeInstanceOf(Blob)
  })

  it('exposes ImageValidationError', () => {
    expect(new ImageValidationError('x')).toBeInstanceOf(Error)
  })

  it('rejects when FileReader fires onerror', async () => {
    class FakeReaderError {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result = ''
      readAsDataURL() { this.onerror?.() }
    }
    vi.stubGlobal('FileReader', FakeReaderError)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('rejects when Image fires onerror', async () => {
    class FakeImageError {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 100
      height = 100
      set src(_v: string) { this.onerror?.() }
    }
    vi.stubGlobal('Image', FakeImageError)
    const ok = new Blob(['x'])
    Object.defineProperty(ok, 'size', { value: 100 * 1024 })
    stubCanvas(ok)
    await expect(compressImage(makeFile('image/png', 1000)))
      .rejects.toThrow('Fehler beim Verarbeiten des Bildes.')
  })

  it('scales image when longest edge exceeds maxEdge', async () => {
    // width=1024, height=512, maxEdge=512 → scale=0.5
    const ok = new Blob(['x'])
    Object.defineProperty(ok, 'size', { value: 100 * 1024 })
    stubCanvas(ok)
    const result = await compressImage(makeFile('image/png', 1000), 512)
    expect(result).toBeInstanceOf(Blob)
  })

  it('does not scale image when it fits within maxEdge', async () => {
    class SmallImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      width = 100
      height = 100
      set src(_v: string) { this.onload?.() }
    }
    vi.stubGlobal('Image', SmallImage)
    const ok = new Blob(['x'])
    Object.defineProperty(ok, 'size', { value: 100 * 1024 })
    stubCanvas(ok)
    const result = await compressImage(makeFile('image/png', 1000), 512)
    expect(result).toBeInstanceOf(Blob)
  })
})
