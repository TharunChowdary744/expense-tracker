import { MISSING_FILE, useGetReceiptUrlQuery } from '../api'
import { localPreviewUrl } from '../queue'

export interface ReceiptSrc {
  src: string | null
  /** The file isn't in Storage (yet), e.g. still uploading from another device. */
  missing: boolean
  error: string | null
  loading: boolean
}

/**
 * Where to show a receipt from: the file itself when it was attached on this device in this
 * session (so it shows at once, even offline), otherwise its download URL, fetched lazily.
 */
export function useReceiptSrc(path: string, { skip = false } = {}): ReceiptSrc {
  const local = localPreviewUrl(path)
  const remote = useGetReceiptUrlQuery(path, { skip: skip || local !== undefined })
  if (local) return { src: local, missing: false, error: null, loading: false }
  const error = typeof remote.error === 'string' ? remote.error : remote.error ? 'error' : null
  return {
    src: remote.data ?? null,
    missing: error === MISSING_FILE,
    error: error === MISSING_FILE ? null : error,
    loading: remote.isLoading,
  }
}
