/**
 * Combined layout + drawer store: panel geometry (sidebar/details widths,
 * narrow state) plus mobile drawer open/close state. One store per root
 * entry, so the framework delivers a single useStore/actions pair. The
 * panel-action subset (toggleSidebar, openDetails, closeDetails) matches
 * ui-layout's LayoutController contract so ctx.layout works unchanged.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** Combined layout + drawer state. */
export type CombinedLayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  drawerOpen: boolean
}

/** Combined layout + drawer actions. */
export type CombinedLayoutActions = {
  setSidebar: (draft: CombinedLayoutState, px: number) => void
  setDetails: (draft: CombinedLayoutState, px: number) => void
  toggleSidebar: (draft: CombinedLayoutState) => void
  setNarrow: (draft: CombinedLayoutState, narrow: boolean) => void
  openDetails: (draft: CombinedLayoutState) => void
  closeDetails: (draft: CombinedLayoutState) => void
  openDrawer: (draft: CombinedLayoutState) => void
  closeDrawer: (draft: CombinedLayoutState) => void
  toggleDrawer: (draft: CombinedLayoutState) => void
}

/**
 * Create the combined layout + drawer store handle. Panel geometry matches
 * ui-layout's createLayoutStore; drawer state is mobile-only and inert on
 * desktop (the desktop layout never reads drawerOpen).
 * @returns the store handle.
 */
export function createCombinedLayoutStore(): EngineStoreHandle<CombinedLayoutState, CombinedLayoutActions> {
  return defineStore({
    init: (): CombinedLayoutState => ({
      sidebar: SIDEBAR_DEFAULT,
      details: 0,
      narrow: false,
      narrowExpanded: false,
      drawerOpen: false,
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      closeDetails: (d) => { d.details = 0 },
      openDrawer: (d) => { d.drawerOpen = true },
      closeDrawer: (d) => { d.drawerOpen = false },
      toggleDrawer: (d) => { d.drawerOpen = !d.drawerOpen },
    },
  })
}
