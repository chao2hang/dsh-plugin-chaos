/** Per-session state for the docked desktop workbench. */
import { useEffect, useState } from 'react'

export type WorkbenchTab = 'explorer' | 'preview' | 'assistant' | 'review' | 'terminal' | 'browser' | 'tasks'

export interface WorkbenchState {
  open: boolean
  width: number
  bottomOpen: boolean
  bottomHeight: number
  active: WorkbenchTab
  bottomActive: WorkbenchTab
  tabs: WorkbenchTab[]
  bottomTabs: WorkbenchTab[]
  split: boolean
  splitRatio: number
  splitActive: WorkbenchTab
  splitTabs: WorkbenchTab[]
}

const DEFAULT_STATE: WorkbenchState = {
  open: false,
  width: 460,
  bottomOpen: false,
  bottomHeight: 240,
  active: 'review',
  bottomActive: 'terminal',
  tabs: ['explorer', 'review', 'terminal'],
  bottomTabs: ['terminal', 'tasks'],
  split: false,
  splitRatio: 0.5,
  splitActive: 'explorer',
  splitTabs: ['explorer', 'preview'],
}

/** Move a tab within one panel's tab order. */
export function moveWorkbenchTab(tabs: readonly WorkbenchTab[], tab: WorkbenchTab, before: WorkbenchTab | undefined): WorkbenchTab[] {
  const rest = tabs.filter(value => value !== tab)
  const index = before === undefined ? rest.length : rest.indexOf(before)
  return index < 0 ? [...rest, tab] : [...rest.slice(0, index), tab, ...rest.slice(index)]
}

/** Close a tab without allowing the workbench to become empty. */
export function closeWorkbenchTab(tabs: readonly WorkbenchTab[], tab: WorkbenchTab): WorkbenchTab[] {
  return tabs.length === 1 ? [...tabs] : tabs.filter(value => value !== tab)
}

/** Clamp the two-pane split fraction so each pane remains usable. */
export function clampWorkbenchSplit(value: number): number {
  return Math.min(0.8, Math.max(0.2, value))
}

/** Whether an open workbench pane is currently displaying Git review. */
export function workbenchShowsGit(state: Pick<WorkbenchState, 'active' | 'bottomActive' | 'bottomOpen' | 'open' | 'split' | 'splitActive'>): boolean {
  return state.open && (state.active === 'review' || state.split && state.splitActive === 'review')
    || state.bottomOpen && state.bottomActive === 'review'
}

export function clampWorkbenchDimension(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function storageKey(sessionId: string | undefined): string {
  return 'dsh-chaos-workbench:v1:' + (sessionId ?? 'root')
}

function load(sessionId: string | undefined): WorkbenchState {
  try {
    const value = window.localStorage.getItem(storageKey(sessionId))
    if (value === null) return DEFAULT_STATE
    const parsed = JSON.parse(value) as Partial<WorkbenchState>
    return {
      ...DEFAULT_STATE,
      ...parsed,
      width: clampWorkbenchDimension(parsed.width ?? DEFAULT_STATE.width, 320, 760),
      bottomHeight: clampWorkbenchDimension(
        parsed.bottomHeight ?? DEFAULT_STATE.bottomHeight,
        160,
        Math.max(160, window.innerHeight - 180),
      ),
    }
  } catch {
    return DEFAULT_STATE
  }
}

/** Persist and update the workbench state selected by the active session. */
export function useWorkbenchState(sessionId: string | undefined): [WorkbenchState, (update: Partial<WorkbenchState>) => void] {
  const [state, setState] = useState(() => load(sessionId))

  useEffect(() => { setState(load(sessionId)) }, [sessionId])
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(sessionId), JSON.stringify(state))
    } catch {
      // Storage can be unavailable in embedded shells.
    }
  }, [sessionId, state])

  const update = (patch: Partial<WorkbenchState>): void => {
    setState(previous => ({
      ...previous,
      ...patch,
      ...(patch.width === undefined ? {} : { width: clampWorkbenchDimension(patch.width, 320, 760) }),
      ...(patch.bottomHeight === undefined
        ? {}
        : {
          bottomHeight: clampWorkbenchDimension(
            patch.bottomHeight,
            160,
            Math.max(160, window.innerHeight - 180),
          ),
        }),
      ...(patch.splitRatio === undefined ? {} : { splitRatio: clampWorkbenchSplit(patch.splitRatio) }),
    }))
  }
  return [state, update]
}
