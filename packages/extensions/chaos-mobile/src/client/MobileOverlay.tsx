/**
 * Mobile shell controls in the `shell.overlay` slot. The layout plugin injects
 * panel actions so the controls follow the same service path as other shell UI.
 *
 * On a mobile viewport, this component:
 * - Activates the SurfacePresentation sheet mode (so Modal/Menu render as
 *   bottom sheets via MobileSheet, and Tooltip suppresses its bubble).
 * - Renders a MobileNavBar (44pt nav bar with menu/back + overflow).
 * - Renders a drawer backdrop for the sidebar.
 * - Manages history state so the system back button closes the details
 *   push-page (iOS-style back navigation).
 * - Publishes the Visual Viewport height while the keyboard is open so CSS
 *   anchors the composer at the visible viewport's bottom.
 * - Marks `<html data-chaos-mobile>` so mobile.css keys off one source of
 *   truth for the mode instead of duplicating the breakpoint in media queries.
 *
 * On desktop it renders nothing and resets the surface presentation to inline.
 */
import { useEffect, useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { isMobileViewport } from './columns.ts'
import { MobileNavBar } from './MobileNavBar.tsx'
import { MobileSheet } from './MobileSheet.tsx'
import { activateViewTab } from './MobileOverflowSheet.tsx'
import { useEdgeSwipe } from './useEdgeSwipe.ts'
import * as uiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { SurfaceSheetProps } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * Sheet presentation is an additive ui-primitives API: fork builds carry it,
 * installed dsh releases may not. Read it as an optional pair so the overlay
 * degrades to inline presentation instead of crashing the slot.
 */
const setSurfacePresentation = uiPrimitives.setSurfacePresentation as ((presentation: { mode: 'sheet'; presentAsSheet: (props: SurfaceSheetProps) => ReactNode }) => void) | undefined
const resetSurfacePresentation = uiPrimitives.resetSurfacePresentation as (() => void) | undefined

/** Panel actions injected by the layout-aware overlay registration. */
export interface MobileOverlayInjected {
  /** Open or close the sidebar drawer. */
  toggleSidebar(this: void): void
  /** Open the details panel — the mobile entry point for the push-page. */
  openDetails(this: void): void
  /** Close the full-screen details sheet. */
  closeDetails(this: void): void
  /** Create a blank session and select it (the overflow sheet's new-session action). */
  newSession(this: void): void
}

/** Props for the mobile overlay entry. */
export type MobileOverlayProps = PropsRuntime<'shell.overlay'> & Pick<PropsRenderSlots<'shell.overlay'>, never> & MobileOverlayInjected

/** Reactively read the viewport size. */
function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() => typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 1024, height: 800 })
  useEffect(() => {
    const handler = (): void => { setSize({ width: window.innerWidth, height: window.innerHeight }) }
    window.addEventListener('resize', handler)
    return () => { window.removeEventListener('resize', handler) }
  }, [])
  return size
}

/**
 * Manage browser history so the system back button closes the details
 * push-page on mobile. When details opens (the frame loses
 * `data-details-collapsed`), a history entry is pushed. The system back
 * button fires popstate, which calls `closeDetails()`. The nav bar's back
 * button calls `history.back()` to reuse the same path.
 * @param closeDetails - the layout service's close action.
 * @param mobile - whether the mobile layout is active.
 */
function useDetailsHistory(closeDetails: () => void, mobile: boolean): void {
  const pushedRef = useRef(false)
  const closeRef = useRef(closeDetails)
  closeRef.current = closeDetails

  useEffect(() => {
    if (!mobile) return
    const frame = document.querySelector('[data-shell-frame]')
    if (frame === null) return

    const observer = new MutationObserver(() => {
      const detailsOpen = !frame.hasAttribute('data-details-collapsed')
      if (detailsOpen && !pushedRef.current) {
        history.pushState({ dshDetailsOpen: true }, '')
        pushedRef.current = true
      } else if (!detailsOpen && pushedRef.current) {
        // Details closed by an ordinary control: remove the entry this overlay owns.
        history.back()
      }
    })
    observer.observe(frame, { attributes: true, attributeFilter: ['data-details-collapsed'] })
    // Claim an entry when the details panel is already open at mount. This can
    // happen after a mobile remount or a resumed Web UI session.
    if (!frame.hasAttribute('data-details-collapsed')) {
      history.pushState({ dshDetailsOpen: true }, '')
      pushedRef.current = true
    }

    const onPopState = (): void => {
      if (pushedRef.current) {
        pushedRef.current = false
        closeRef.current()
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      observer.disconnect()
      window.removeEventListener('popstate', onPopState)
      if (pushedRef.current) history.back()
    }
  }, [mobile])
}

/**
 * Mobile overlay: nav bar + backdrop + surface presentation activation +
 * keyboard inset + history management. Only renders anything on a mobile
 * viewport (see {@link isMobileViewport}).
 * @param props - composed slot props + injected panel actions.
 */
export function MobileOverlay({
  toggleSidebar, openDetails, closeDetails, newSession, useSessions,
}: MobileOverlayProps): ReactNode {
  const viewport = useViewport()
  const mobile = isMobileViewport(viewport.width, viewport.height)
  const summary = useSessions(state => state.current === undefined ? undefined : state.byId[state.current])
  const [overflowOpen, setOverflowOpen] = useState(false)
  // The trajectory tab exists only while a session is active; the switches
  // seed from localStorage so the menu reflects the persisted visibility.
  const [hasTrajectory, setHasTrajectory] = useState(false)
  // Whether the trajectory view is currently active: the menu row flips to
  // the OTHER view, since the tab ring itself is hidden on mobile.
  const [trajectoryActive, setTrajectoryActive] = useState(false)
  const [statsSummary, setStatsSummary] = useState<string | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Activate sheet presentation on mobile; reset to inline on desktop.
  useEffect(() => {
    if (!mobile) {
      resetSurfacePresentation?.()
      return
    }
    if (setSurfacePresentation === undefined) return
    const presentAsSheet = (props: SurfaceSheetProps): ReactNode => (
      <MobileSheet onClose={props.onClose} {...(props.title === undefined ? {} : { title: props.title })}>
        {props.children}
      </MobileSheet>
    )
    setSurfacePresentation({ mode: 'sheet', presentAsSheet })
    return () => { resetSurfacePresentation?.() }
  }, [mobile])

  // Mark the root for CSS targeting — mobile.css keys every layout rule off
  // this attribute so the stylesheet cannot disagree with this switch at the
  // breakpoint (a plain media query would re-derive the decision and diverge
  // for short landscape viewports).
  useEffect(() => {
    const root = document.documentElement
    if (mobile) root.setAttribute('data-chaos-mobile', '')
    else root.removeAttribute('data-chaos-mobile')
    return () => { root.removeAttribute('data-chaos-mobile') }
  }, [mobile])

  // Stats remain out of the scrolling conversation on phones; mirror the
  // existing durable stats-line text in the overflow sheet instead. The source
  // component owns projection and locale formatting, while this observer only
  // follows its rendered text as session activity changes.
  useEffect(() => {
    if (!mobile) return
    const update = (): void => {
      const text = document.querySelector<HTMLElement>('[data-stats-line]')?.textContent.trim()
      setStatsSummary(text === '' || text === undefined ? undefined : text)
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    update()
    return () => { observer.disconnect() }
  }, [mobile])

  // Keep the center column aligned to the actual visible viewport throughout
  // keyboard animation. Android browsers may pan that viewport (offsetTop)
  // without changing the height enough to alter an inset, so height alone can
  // leave the sticky composer detached from the keyboard.
  useEffect(() => {
    const root = document.documentElement
    const clear = (): void => {
      root.style.removeProperty('--chaos-visual-viewport-height')
      root.style.removeProperty('--chaos-visual-viewport-offset-top')
    }
    if (!mobile) {
      clear()
      return
    }
    const viewport = window.visualViewport
    if (!viewport) {
      clear()
      return
    }
    const sync = (): void => {
      root.style.setProperty('--chaos-visual-viewport-height', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--chaos-visual-viewport-offset-top', `${Math.round(viewport.offsetTop)}px`)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
      clear()
    }
  }, [mobile])

  // System back-button closes the details push-page.
  useDetailsHistory(closeDetails, mobile)

  // Edge-swipe: rightward from the left edge opens the drawer;
  // leftward while the drawer is open closes it.
  useEdgeSwipe(mobile, drawerOpen, () => { setDrawerOpen(true); toggleSidebar() }, () => { setDrawerOpen(false); toggleSidebar() })

  // The settings trigger remains owned by ui-settings-general. Observe its
  // dedicated page rather than duplicating its local open state.
  useEffect(() => {
    if (!mobile) return
    const update = (): void => { setSettingsOpen(document.querySelector('[data-settings-overlay]') !== null) }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    update()
    return () => { observer.disconnect() }
  }, [mobile])

  if (!mobile) return null

  // On mobile, the nav bar's back button calls history.back() so the
  // popstate path closes details — one code path for back and system gesture.
  const onBack = (): void => { history.back() }

  // The nav bar portals to document.body: the shell.overlay slot seat creates
  // a stacking context below the sidebar/details columns, and the bar must stay
  // above both (drawer toggle reachable, back button over the details sheet).
  return (
    <div data-chaos-mobile-overlay="">
      {createPortal(
        <MobileNavBar
          toggleSidebar={() => { setDrawerOpen(open => !open); toggleSidebar() }}
          closeDetails={onBack}
          closeSettings={() => { document.querySelector<HTMLButtonElement>('[data-settings-page-close]')?.click() }}
          settingsOpen={settingsOpen}
          // The alpha.3 host summary no longer projects the per-session agent
          // preset, so the mode chip has no data source yet; feed title only.
          // MobileNavBar.mode stays available for a future provider.
          {...(summary === undefined ? {} : { title: summary.displayTitle })}
          openOverflow={() => {
            setHasTrajectory(document.querySelector("[data-view-tab='trajectory']") !== null)
            setTrajectoryActive(document.querySelector("[data-view-tab='trajectory'][aria-selected='true']") !== null)
            const stats = document.querySelector<HTMLElement>('[data-stats-line]')?.textContent.trim()
            setStatsSummary(stats === '' || stats === undefined ? undefined : stats)
            setOverflowOpen(true)
          }}
        />,
        document.body,
      )}
      {/* Backdrop for the sidebar drawer. */}
      <div
        className="chaos-backdrop"
        onClick={() => { setDrawerOpen(false); toggleSidebar() }}
        aria-hidden="true"
        data-chaos-drawer-backdrop=""
      />
      {/* Overflow sheet: the mobile entry points that have no other chrome. */}
      {overflowOpen && (
        <MobileSheet title="更多" onClose={() => { setOverflowOpen(false) }}>
          <div className="chaos-overflow-menu" role="menu" aria-label="更多操作">
            <button
              type="button"
              role="menuitem"
              className="chaos-overflow-item"
              onClick={() => { setOverflowOpen(false); newSession() }}
            >
              新建会话
            </button>
            <button
              type="button"
              role="menuitem"
              className="chaos-overflow-item"
              onClick={() => { setOverflowOpen(false); openDetails() }}
            >
              打开详情面板
            </button>
            <button
              type="button"
              role="menuitem"
              className="chaos-overflow-item"
              onClick={() => {
                setOverflowOpen(false)
                document.dispatchEvent(new Event('dsh-better-sidebar:open-mobile-tools'))
              }}
            >
              打开工具面板
              <span className="chaos-overflow-hint">文件、源代码管理、任务、终端和侧边对话</span>
            </button>
            {hasTrajectory && (
              <button
                type="button"
                role="menuitem"
                className="chaos-overflow-item"
                onClick={() => { setOverflowOpen(false); activateViewTab(trajectoryActive ? 'chat' : 'trajectory') }}
              >
                {trajectoryActive ? '对话视图' : '轨迹视图'}
                <span className="chaos-overflow-hint">{trajectoryActive ? '返回消息流' : '时间线与调用详情'}</span>
              </button>
            )}
            {statsSummary !== undefined && (
              <section className="chaos-overflow-stats" aria-label="会话统计">
                <h2>会话统计</h2>
                <p>{statsSummary}</p>
              </section>
            )}
          </div>
        </MobileSheet>
      )}
    </div>
  )
}
