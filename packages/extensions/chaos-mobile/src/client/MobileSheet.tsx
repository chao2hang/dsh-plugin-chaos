/**
 * Mobile bottom sheet: iOS-style presentation surface with a grabber handle,
 * interactive medium / large detents, drag-to-dismiss, backdrop tap, Escape close,
 * scroll containment, and focus trapping. Serves as the `presentAsSheet`
 * renderer for the `SurfacePresentation` provider when chaos-mobile is active
 * on a mobile viewport.
 *
 * Design references: iOS Human Interface Guidelines — Sheets.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import css from './MobileSheet.module.css'

/** Sheet detent: medium (~50dvh) or large (~90dvh). */
export type SheetDetent = 'medium' | 'large'

/** Props for the mobile sheet. */
export interface MobileSheetProps {
  /** Content to render inside the sheet body. */
  children: ReactNode
  /** Close the sheet (drag-to-dismiss, backdrop tap, Escape). */
  onClose: () => void
  /** Accessible title for the sheet (aria-label). */
  title?: string
  /** Initial detent height (default medium). */
  detent?: SheetDetent
}

/** Threshold (px) past which a drag releases the sheet closed. */
const DISMISS_THRESHOLD = 120

/** Threshold (px) that changes the active sheet detent. */
const DETENT_THRESHOLD = 72

/**
 * Render a bottom sheet over a dimmed backdrop. The sheet slides up from the
 * bottom and settles between medium and large detents before it dismisses.
 * Backdrop and Escape also close it. Focus is trapped within the sheet
 * while open.
 * @param props - see {@link MobileSheetProps}.
 * @returns a portaled sheet tree, or null on server.
 */
export function MobileSheet({ children, onClose, title, detent = 'medium' }: MobileSheetProps): ReactNode {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [activeDetent, setActiveDetent] = useState(detent)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(0)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Focus trap: capture the element that had focus before the sheet opened,
  // move focus into the sheet, and restore it on close. Tab cycles within.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const sheet = sheetRef.current
    sheet?.focus()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || sheet === null) return
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [])

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Only start dragging from the grabber handle, not the scrollable content.
    const target = e.target as HTMLElement
    if (!target.closest(`.${css.grabber ?? ''}`)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = e.clientY
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dy = e.clientY - dragStart.current
    setDragY(Math.max(0, dy))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    const delta = e.clientY - dragStart.current
    if (delta > DISMISS_THRESHOLD) {
      if (activeDetent === 'large') setActiveDetent('medium')
      else onClose()
    } else if (delta < -DETENT_THRESHOLD) {
      setActiveDetent('large')
    }
    setDragY(0)
  }, [activeDetent, onClose])

  if (typeof document === 'undefined') return null

  return createPortal((
    <div className={css.root} role="presentation">
      <div className={css.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={css.sheet}
        data-detent={activeDetent}
        data-dragging={dragging || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Sheet'}
        tabIndex={-1}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        <button
          type="button"
          className={css.grabber}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Adjust sheet size"
        />
        <div className={css.body}>
          {children}
        </div>
      </div>
    </div>
  ), document.body)
}
