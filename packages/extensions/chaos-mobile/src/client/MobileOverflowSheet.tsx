/** Overflow-menu helpers for views shared with the desktop conversation. */

/** Switch the active session view by clicking its stable conversation tab. */
export function activateViewTab(viewId: string): boolean {
  const tab = document.querySelector<HTMLButtonElement>(`[data-view-tab='${viewId}']`)
  if (tab === null) return false
  tab.click()
  return true
}
