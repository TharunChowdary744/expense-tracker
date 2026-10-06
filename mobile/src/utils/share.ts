import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/**
 * Saves a file for the user: writes the file to the app's cache and
 * opens the share sheet, where the user can save it to Files or Drive, or send it.
 */
export async function downloadFile(content: string | Blob, fileName: string, type = 'text/plain') {
  const file = new File(Paths.cache, fileName)
  if (file.exists) file.delete()
  file.create()
  if (typeof content === 'string') {
    file.write(content)
  } else {
    file.write(new Uint8Array(await content.arrayBuffer()))
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: type, dialogTitle: fileName })
  }
  return file.uri
}
