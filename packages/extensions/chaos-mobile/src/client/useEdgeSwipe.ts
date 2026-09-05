/**
 * Edge-swipe gesture hook: detects a rightward swipe from the left screen
 * edge to open the sidebar drawer, and a leftward swipe on the drawer to
 * close it. The gesture follows the finger (translateX) and snaps open or
 * closed based on a threshold. Cancellable — releasing below the threshold
 * snaps back.
 *
 * Design reference: iOS HIG — Edge swipes.
 */
import { useEffect, useRef } from 'react'

/** Width of the left-edge gesture zone (px). */
const EDGE_WIDTH = 24
/** Fraction of the drawer width past which a release commits the open. */
const OPEN_THRESHOLD = 0.4
/** Maximum drawer width for threshold calculation. */
const DRAWER_WIDTH = 300

/**
 * Attach edge-swipe listeners to the document. On a rightward swipe from the
 * left edge, calls `onOpen`. On a leftward swipe while the drawer is open,
 * calls `onClose`. The hook is a no-op when `enabled` is false.
 * @param enabled - whether the gesture is active (mobile only).
 * @param drawerOpen - whether the drawer is currently open; leftward swipes close only in this state.
 * @param onOpen - called when the open threshold is met.
 * @param onClose - called when the close threshold is met.
 */
export function useEdgeSwipe(enabled: boolean, drawerOpen: boolean, onOpen: () => void, onClose: () => void): void {
  const handlers = useRef({ onOpen, onClose })
  handlers.current = { onOpen, onClose }

  useEffect(() => {
    if (!enabled) return
    let startX = 0
    let startY = 0
    let active = false
    let fromEdge = false

    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length !== 1) return
      const t = e.touches.item?.(0) ?? e.touches[0] ?? null
      if (t === null) return
      startX = t.clientX
      startY = t.clientY
      fromEdge = startX <= EDGE_WIDTH
      active = fromEdge || drawerOpen
    }

    const onTouchMove = (e: TouchEvent): void => {
      if (!active) return
      const t = e.touches.item?.(0) ?? e.touches[0] ?? null
      if (t === null) return
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      // Ignore vertical scrolls.
      if (dy > Math.abs(dx) && dx < EDGE_WIDTH) { active = false; return }
    }

    const onTouchEnd = (e: TouchEvent): void => {
      if (!active) { active = false; return }
      active = false
      const t = e.changedTouches.item?.(0) ?? e.changedTouches[0] ?? null
      if (t === null) return
      const dx = t.clientX - startX
      if (fromEdge && dx > DRAWER_WIDTH * OPEN_THRESHOLD) {
        handlers.current.onOpen()
      } else if (!fromEdge && dx < -DRAWER_WIDTH * OPEN_THRESHOLD) {
        handlers.current.onClose()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [drawerOpen, enabled])
}
