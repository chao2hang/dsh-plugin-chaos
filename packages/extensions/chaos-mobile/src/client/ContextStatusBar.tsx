/**
 * Mobile context-usage status bar: the composer's context ring has no room in
 * the phone rail, so on a mobile viewport the occupancy moves to a thin
 * full-width progress bar portaled below the navigation bar. The bar is pure
 * status (no pointer targets); the token details live in the overflow sheet,
 * which reads the same value through the context meter store.
 *
 * The entry sits in the session-scoped `conversation.input.left` list, so it
 * mounts only with a live session (the standard kit's `useProjection` is its
 * only input) and unmounts — clearing the store — with the session. The bar
 * is hidden while the dedicated settings page covers the conversation.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the `contextPressure` / `contextBreakdown` keys into the
// session projection map for the useProjection reads below.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import {
  publishChaosContextMeter,
  type ChaosContextMeter,
} from './context-meter-store.ts'

/** Props for the context status bar entry (session standard kit). */
export type ContextStatusBarProps = PropsRuntime<'conversation.input.left'>

/** Occupancy at which the bar turns from the business blue to the warning tint. */
const WARN_PERCENT = 70
/** Occupancy at which the bar turns to the danger tint. */
const DANGER_PERCENT = 90

/**
 * Render the fixed top context bar and publish the folded meter to the store.
 * @param props - session standard kit (the `useProjection` seat is consumed).
 * @returns the portaled bar, or null while no pressure or capacity is known.
 */
export function ContextStatusBar({ useProjection }: ContextStatusBarProps): ReactNode {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')

  // Both fields are last-wins records that can be absent independently; the
  // bar waits until numerator and capacity are both known (mirrors the
  // desktop ring's contextOccupancy fold).
  const meter = useMemo<ChaosContextMeter | undefined>(() => {
    const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
    if (usedTokens === undefined || pressure?.contextWindow === undefined) return undefined
    return {
      percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
      usedTokens,
      contextWindow: pressure.contextWindow,
      breakdown,
    }
  }, [pressure, breakdown])

  // The dedicated settings page covers the conversation; left up, the bar
  // would float over the settings content. Hide it while the overlay is
  // mounted (the same observation MobileOverlay drives its nav bar with).
  const [settingsOpen, setSettingsOpen] = useState(
    () => typeof document !== 'undefined' && document.querySelector('[data-settings-overlay]') !== null,
  )
  useEffect(() => {
    const update = (): void => { setSettingsOpen(document.querySelector('[data-settings-overlay]') !== null) }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    update()
    return () => { observer.disconnect() }
  }, [])

  useEffect(() => { publishChaosContextMeter(meter) }, [meter])
  // Unmount = the session went away: clear the sheet's details with it.
  useEffect(() => () => { publishChaosContextMeter(undefined) }, [])

  if (meter === undefined || settingsOpen || typeof document === 'undefined') return null
  const state = meter.percent >= DANGER_PERCENT ? 'danger' : meter.percent >= WARN_PERCENT ? 'warn' : 'ok'
  return createPortal(
    <div data-chaos-context-bar={state} aria-hidden>
      <div data-chaos-context-bar-fill style={{ width: `${meter.percent}%` }} />
    </div>,
    document.body,
  )
}
