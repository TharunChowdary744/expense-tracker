import { useEffect, useState } from 'react'

/** True while the element is within `rootMargin` of the viewport (for infinite scroll). */
export function useInView(element: Element | null, rootMargin = '600px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      {
        rootMargin,
      },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, rootMargin])
  return inView
}
