import { File } from 'expo-file-system'

/** Reads a local file (file:// or content:// URI) into a Blob for Firebase Storage. */
export async function readFileBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri)
  return response.blob()
}

/** Size in bytes of a local file, or 0 when it can't be read. */
export function fileSize(uri: string): number {
  try {
    return new File(uri).size ?? 0
  } catch {
    return 0
  }
}
