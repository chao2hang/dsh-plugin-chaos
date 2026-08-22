/**
 * Mobile-aware AppFrame: shadows the built-in 'root' slot (priority: -1).
 * At desktop width (>= 768px) it renders the identical three-column grid
 * with drag handles as ui-layout's AppFrame. Below 768px it switches to a
 * drawer layout: sidebar becomes a slide-in drawer with backdrop; details
 * becomes a full-screen overlay; a hamburger button opens the drawer.
 * All four child slots (sidebar, conversation, details, shell.overlay) are
 * preserved. Uses a combined layout+drawer store; ctx.layout works because
 * the panel-action subset matches the LayoutController contract.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import {
  computeColumns, MOBILE_BREAKPOINT,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT,
} from './columns.ts'
import type { createCombinedLayoutStore } from './combined-store.ts'
import css from './ChaosAppFrame.module.css'

/** Full composed props: runtime share + child-slot render share + store share. */
export type ChaosAppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createCombinedLayoutStore>>

/** Center column grid item (desktop). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item (desktop). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/** Hamburger button icon (three lines). */
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports.
 */
function DragHandle(props: {
  side: 'sidebar' | 'details'
  left: number
  onStart: () => void
  onDrag: (dx: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/**
 * The mobile-aware frame (see module doc).
 */
export function ChaosAppFrame({
  useStore,
  useSessions,
  actions,
  renderSlot,
}: ChaosAppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Auto-close the drawer when the current session changes.
  const prevSession = useRef(detailsSession)
  useEffect(() => {
    if (prevSession.current !== detailsSession && panels.drawerOpen) {
      actions.closeDrawer()
    }
    prevSession.current = detailsSession
  }, [panels.drawerOpen, detailsSession, actions])

  // Track the frame's own box: rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  const mobile = viewport < MOBILE_BREAKPOINT
  const narrow = !mobile && viewport < SIDEBAR_AUTO_COLLAPSE

  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])

  // --- Desktop layout (>= MOBILE_BREAKPOINT) ---
  if (!mobile) {
    const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
    const sidebarPreference = sidebarCollapsed
      ? 0
      : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
    const cols = computeColumns(viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)

    const sidebarBase = useRef(0)
    const detailsBase = useRef(0)
    const [dragging, setDragging] = useState(false)
    const onDragEnd = useCallback(() => { setDragging(false) }, [])
    const onSidebarStart = useCallback(() => { sidebarBase.current = cols.sidebar; setDragging(true) }, [])
    const onDetailsStart = useCallback(() => { detailsBase.current = cols.details; setDragging(true) }, [])
    const onSidebarDrag = useCallback((dx: number) => {
      actions.setSidebar(sidebarBase.current + dx)
    }, [actions])
    const onDetailsDrag = useCallback((dx: number) => {
      actions.setDetails(detailsBase.current - dx)
    }, [actions])

    return (
      <div
        ref={frameRef}
        className={css.frame}
        style={{ gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` }}
        data-sidebar-collapsed={sidebarCollapsed || undefined}
        data-details-collapsed={cols.details === 0 || undefined}
        data-dragging={dragging || undefined}
      >
        <div className={css.sidebarCol}>
          {renderSlot('sidebar', { collapsed: sidebarCollapsed, width: cols.sidebar })}
        </div>
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn>{renderSlot('details', {})}</DetailsColumn>
        <div className={css.overlayLayer} data-shell-overlay>
          {renderSlot('shell.overlay', {})}
        </div>
        {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
        {cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
      </div>
    )
  }

  // --- Mobile layout (< MOBILE_BREAKPOINT) ---
  // Grid: conversation full width; sidebar and details are fixed overlays.
  return (
    <div
      ref={frameRef}
      className={css.frameMobile}
      data-chaos-drawer={panels.drawerOpen ? 'open' : 'closed'}
      data-chaos-details={detailsSession !== undefined ? 'open' : 'closed'}
    >
      <div className={css.mobileConversation}>
        {renderSlot('conversation', {})}
      </div>

      <div className={css.drawerSidebar} data-open={panels.drawerOpen || undefined}>
        {renderSlot('sidebar', { collapsed: false, width: SIDEBAR_DEFAULT })}
      </div>

      {detailsSession !== undefined && (
        <div className={css.detailsOverlay}>
          {renderSlot('details', {})}
        </div>
      )}

      {(panels.drawerOpen || detailsSession !== undefined) && (
        <div
          className={css.backdrop}
          onClick={() => {
            if (panels.drawerOpen) actions.closeDrawer()
            if (detailsSession !== undefined) actions.closeDetails()
          }}
        />
      )}

      {!panels.drawerOpen && detailsSession === undefined && (
        <button
          className={css.hamburger}
          onClick={() => actions.openDrawer()}
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>
      )}

      <div className={css.overlayLayerMobile} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
