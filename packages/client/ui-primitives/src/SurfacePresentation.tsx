/**
 * Surface presentation seam: lets Modal / Menu / Tooltip ask whether they
 * should render as an inline (desktop) element or a bottom sheet (mobile),
 * and delegate sheet rendering to an injected presenter when one is
 * available. The default is `inline` with no sheet presenter, so every
 * consumer behaves exactly as before unless
 * {@link setSurfacePresentation} overrides it.
 *
 * Uses a module-level store with `useSyncExternalStore` rather than React
 * context, because Modal and Menu portal their content to `document.body`
 * and the provider must reach them regardless of where it sits in the React
 * tree (the shell.overlay slot is a sibling of the conversation/sidebar
 * columns, not an ancestor).
 *
 * Service Definition role: this module owns the contract (the store, the
 * type, and the hook). The Provider role is downstream: a mobile plugin
 * calls {@link setSurfacePresentation} to switch the mode and inject its
 * sheet renderer, and {@link resetSurfacePresentation} to restore desktop.
 */
import { useSyncExternalStore, type ReactNode } from 'react'

/** How a surface should present itself. */
export type SurfaceMode = 'inline' | 'sheet'

/** Props handed to a sheet presenter when a surface delegates. */
export interface SurfaceSheetProps {
  /** Which primitive is delegating. */
  surface: 'dialog' | 'menu' | 'tooltip'
  /** Content to render inside the sheet body. */
  children: ReactNode
  /** Close the sheet (drag-to-dismiss, backdrop tap, Escape). */
  onClose: () => void
  /** Accessible title for the sheet (Modal passes its title). */
  title?: string
}

/** The presentation contract a provider fills. */
export interface SurfacePresentation {
  /** Current mode — `inline` (desktop default) or `sheet` (mobile). */
  mode: SurfaceMode
  /** When `mode === 'sheet'`, render content as a bottom sheet. */
  presentAsSheet?: (props: SurfaceSheetProps) => ReactNode
}

// ── Module-level store ──────────────────────────────────────────────────

let currentMode: SurfaceMode = 'inline'
let currentPresenter: ((props: SurfaceSheetProps) => ReactNode) | undefined
const listeners = new Set<() => void>()

// Cached snapshot: useSyncExternalStore requires referential stability when
// nothing changed. Rebuilt only when the mode or presenter actually changes.
let cachedSnapshot: SurfacePresentation = { mode: 'inline' }

function rebuildSnapshot(): void {
  cachedSnapshot = currentPresenter === undefined
    ? { mode: currentMode }
    : { mode: currentMode, presentAsSheet: currentPresenter }
}

function getSnapshot(): SurfacePresentation {
  return cachedSnapshot
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Set the active surface presentation. A mobile plugin calls this on mount
 * (mobile viewport) to switch to sheet mode and inject its sheet renderer.
 * @param presentation - the contract (mode + optional sheet presenter).
 */
export function setSurfacePresentation(presentation: SurfacePresentation): void {
  currentMode = presentation.mode
  currentPresenter = presentation.presentAsSheet
  rebuildSnapshot()
  listeners.forEach((fn) =>{  fn() })
}

/**
 * Reset to the desktop default (inline, no sheet presenter). A mobile plugin
 * calls this on dispose or when the viewport widens past the breakpoint.
 */
export function resetSurfacePresentation(): void {
  currentMode = 'inline'
  currentPresenter = undefined
  rebuildSnapshot()
  listeners.forEach((fn) =>{  fn() })
}

/**
 * Read the active surface presentation. Components call this to decide whether
 * to render inline or delegate to the injected sheet presenter.
 * @returns the current presentation contract (default: inline).
 */
export function useSurfacePresentation(): SurfacePresentation {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
