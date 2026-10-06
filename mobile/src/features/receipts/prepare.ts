import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { MAX_IMAGE_DIMENSION, TARGET_IMAGE_BYTES } from '@/features/receipts/schemas'
import { isPdfType, storedName } from '@/features/receipts/utils'
import { fileSize } from '@m/utils/files'

/** A file picked on the device, before or after it is prepared for upload. */
export interface LocalFile {
  uri: string
  name: string
  type: string
  size: number
  width?: number
  height?: number
}

export class PrepareError extends Error {}

/** The new width and height for an image whose longest side is at most `max`. */
export function scaledSize(
  width: number,
  height: number,
  max = MAX_IMAGE_DIMENSION,
): { width: number; height: number } | null {
  const longest = Math.max(width, height)
  if (!width || !height || longest <= max) return null
  const ratio = max / longest
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/**
 * Photos are shrunk to at most 1600px on the longest side and saved as JPEG (lower quality
 * until they are near 300 KB), like the web app. PDFs are uploaded as they are.
 */
export async function prepareLocalFile(file: LocalFile): Promise<LocalFile> {
  if (isPdfType(file.type)) return file
  try {
    const context = ImageManipulator.manipulate(file.uri)
    const size = file.width && file.height ? scaledSize(file.width, file.height) : null
    if (size) context.resize({ width: size.width })
    const image = await context.renderAsync()
    let result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG })
    let bytes = fileSize(result.uri)
    for (const compress of [0.6, 0.45]) {
      if (bytes <= TARGET_IMAGE_BYTES) break
      result = await image.saveAsync({ compress, format: SaveFormat.JPEG })
      bytes = fileSize(result.uri)
    }
    return {
      uri: result.uri,
      name: storedName(file.name, 'jpg'),
      type: 'image/jpeg',
      size: bytes,
      width: result.width,
      height: result.height,
    }
  } catch {
    throw new PrepareError(`“${file.name}” couldn’t be compressed. Try another photo.`)
  }
}
