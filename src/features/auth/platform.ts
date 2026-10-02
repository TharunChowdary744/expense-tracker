/**
 * Popups are unreliable on phones and in installed PWAs (they open a new tab or are blocked),
 * so Google sign-in uses a full-page redirect there and a popup on desktop browsers.
 */
export function shouldUseRedirectSignIn(): boolean {
  if (typeof window === 'undefined') return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return standalone || mobile
}
