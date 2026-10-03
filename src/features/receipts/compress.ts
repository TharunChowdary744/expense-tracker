import compressionLibUrl from 'browser-image-compression/dist/browser-image-compression.js?url'
import { MAX_IMAGE_DIMENSION, TARGET_IMAGE_BYTES } from './schemas'
import { isHeic, storedName } from './utils'

/** A file that couldn't be prepared, with a message for the user. */
export class PrepareError extends Error {}

/** Image types the browser can draw on a canvas everywhere; others are uploaded as they are. */
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function asFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type, lastModified: Date.now() })
}

/** HEIC → JPEG with heic2any (loaded only when needed; it is large). */
async function heicToJpeg(file: File): Promise<File> {
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    const blob = Array.isArray(out) ? out[0] : out
    if (!blob) throw new Error('No image in the HEIC file')
    return asFile(blob, storedName(file.name, 'jpg'), 'image/jpeg')
  } catch (error) {
    console.warn('[receipts] HEIC conversion failed', error)
    throw new PrepareError(
      `“${file.name}” is a HEIC photo this browser can’t convert. Share it as JPEG and try again.`,
    )
  }
}

/**
 * Makes a picked file ready to upload: HEIC photos become JPEG, and photos larger than
 * TARGET_IMAGE_BYTES are resized to fit MAX_IMAGE_DIMENSION and compressed to JPEG near that
 * size. PDFs and other images are kept as they are. Throws PrepareError with a message to show.
 */
export async function prepareFile(file: File, signal?: AbortSignal): Promise<File> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return file.type ? file : asFile(file, file.name, 'application/pdf')
  }
  let image = isHeic(file) ? await heicToJpeg(file) : file
  if (image.size <= TARGET_IMAGE_BYTES || !COMPRESSIBLE.includes(image.type)) return image

  try {
    const { default: imageCompression } = await import('browser-image-compression')
    const compressed = await imageCompression(image, {
      maxSizeMB: TARGET_IMAGE_BYTES / (1024 * 1024),
      maxWidthOrHeight: MAX_IMAGE_DIMENSION,
      fileType: 'image/jpeg',
      initialQuality: 0.85,
      useWebWorker: true,
      // The worker loads the library from our own origin, not a CDN, so it works offline.
      libURL: new URL(compressionLibUrl, window.location.href).href,
      ...(signal ? { signal } : {}),
    })
    if (compressed.size < image.size) {
      image = asFile(compressed, storedName(image.name, 'jpg'), 'image/jpeg')
    }
    return image
  } catch (error) {
    if (isAbort(error) || signal?.aborted) throw error
    // An image the browser can't draw is still worth keeping: upload it as it is.
    console.warn('[receipts] compression failed, uploading the original', error)
    return image
  }
}
