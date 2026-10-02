import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldUseRedirectSignIn } from './platform'

function stub({ standalone = false, ua = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130' } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone') }))
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
}

afterEach(() => vi.restoreAllMocks())

describe('shouldUseRedirectSignIn', () => {
  it('uses a popup on desktop browsers', () => {
    stub()
    expect(shouldUseRedirectSignIn()).toBe(false)
  })

  it('uses redirect in an installed PWA', () => {
    stub({ standalone: true })
    expect(shouldUseRedirectSignIn()).toBe(true)
  })

  it('uses redirect on mobile browsers', () => {
    stub({ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36' })
    expect(shouldUseRedirectSignIn()).toBe(true)
  })
})
