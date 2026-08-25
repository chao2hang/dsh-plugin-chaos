/**
 * Column geometry constants and solver, copied from ui-layout for package
 * independence (cross-package value imports are forbidden by the client
 * bundle purity gate). The desktop layout uses the same concession chain so
 * its behavior matches the shipped AppFrame exactly.
 */

/** Resolved widths for one frame. */
export interface Columns { sidebar: number; center: number; details: number }

/** Center column floor; only the final fallback may go below it. */
export const CENTER_MIN = 640
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail width. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses. */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Details drag clamp floor. */
export const DETAILS_MIN = 300
/** Details drag clamp ceiling. */
export const DETAILS_MAX = 520
/** Details width before any user drag. */
export const DETAILS_DEFAULT = 360
/** Mobile breakpoint: below this width, the drawer layout takes over. */
export const MOBILE_BREAKPOINT = 768
/**
 * Landscape phones: a viewport this short is a phone rotated sideways even
 * when its width passes the portrait breakpoint. At or above this height the
 * width test alone decides.
 */
export const MOBILE_LANDSCAPE_MAX_HEIGHT = 500

/**
 * Decide whether the drawer/mobile shell should own the viewport. Fires for
 * narrow portraits (width below {@link MOBILE_BREAKPOINT}) and for short
 * landscape viewports (phones rotated sideways), where the three-column
 * desktop grid cannot fit.
 * @param width - viewport width in px.
 * @param height - viewport height in px.
 * @returns whether the mobile shell is active.
 */
export function isMobileViewport(width: number, height: number): boolean {
  return width < MOBILE_BREAKPOINT || height < MOBILE_LANDSCAPE_MAX_HEIGHT
}

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame. Pure function
 * matching ui-layout's computeColumns: center stays above CENTER_MIN by
 * shrinking then auto-closing details; the sidebar never concedes.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @returns resolved widths.
 */
export function computeColumns(viewport: number, sidebar: number, details: number): Columns {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)

  if (s + d0 + CENTER_MIN <= viewport) return { sidebar: s, center: viewport - s - d0, details: d0 }

  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 }

  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}
