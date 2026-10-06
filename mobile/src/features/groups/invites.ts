/**
 * Reads the invite token from what someone pasted: a full invite link (web or app), a
 * "ledgerly://join/…" link, or the bare token.
 */
export function inviteTokenFrom(text: string): string | null {
  const value = text.trim()
  if (!value) return null
  const match = /\/join\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/.exec(value)
  if (match?.[1]) return match[1]
  return /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null
}
