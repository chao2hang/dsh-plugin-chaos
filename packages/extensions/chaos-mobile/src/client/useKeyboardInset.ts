/**
 * Keyboard inset hook: tracks the on-screen keyboard's inset via the
 * Visual Viewport API so the composer can lift above it. Falls back to
 * 0 when the API is unavailable (desktop, older browsers).
 *
 * Design reference: iOS HIG — Keyboard and Input Accessories.
 */
import { useEffect, useState } from 'react'

/**
 * Observe the visual viewport and report the keyboard inset in px (0 when the
 * keyboard is hidden). The inset is the difference between the layout viewport
 * height and the visual viewport height, clamped to non-negative.
 * @returns the keyboard inset in px (0 when no keyboard or API unavailable).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const update = (): void => {
      const layoutHeight = window.innerHeight
      const visualHeight = vv.height
      const diff = layoutHeight - visualHeight
      setInset(diff > 0 ? diff : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
