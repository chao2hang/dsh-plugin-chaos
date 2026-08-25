/**
 * Mobile navigation bar: a 44pt top bar that replaces the floating hamburger
 * and details-close buttons. Left side is context-aware via CSS — it shows a
 * menu toggle while the details panel is closed and a back button while it is
 * open (driven by the AppFrame's `data-details-collapsed` attribute). The
 * center holds a truncated title, the right side holds a single overflow button.
 *
 * Design reference: iOS HIG — Navigation Bars.
 */
import type { ReactNode } from 'react'
import { IconChevronLeftOutline14, IconEllipsisOutline16, IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './MobileNavBar.module.css'

/** Panel actions injected by the layout-aware overlay registration. */
export interface MobileNavBarInjected {
  /** Open or close the sidebar drawer. */
  toggleSidebar(this: void): void
  /** Close the full-screen details sheet. */
  closeDetails(this: void): void
  /** Open the overflow sheet (trajectory + stats controls). */
  openOverflow(this: void): void
  /** Close the mobile settings page when it owns the current surface. */
  closeSettings(this: void): void
}

/** Props for the mobile nav bar entry. */
export type MobileNavBarProps = MobileNavBarInjected & {
  /** Current session title, if a session is selected. */
  title?: string
  /** Current session's selected agent mode, if one was recorded. */
  mode?: string
  /** Whether the dedicated mobile settings page is open. */
  settingsOpen: boolean
}


/**
 * Render the mobile navigation bar. The bar is always present below the mobile
 * breakpoint; CSS on the AppFrame's data attributes controls which left button
 * is visible (menu vs. back).
 * @param props - composed slot props + injected panel actions.
 */
export function MobileNavBar({
  toggleSidebar, closeDetails, closeSettings, openOverflow, title, mode, settingsOpen,
}: MobileNavBarProps): ReactNode {
  return (
    <nav className={css.bar} data-chaos-nav-bar={settingsOpen || undefined} aria-label="Mobile navigation">
      <div className={css.left}>
        {/* Menu toggle — visible while details is closed. */}
        <button
          type="button"
          className={css.button}
          data-chaos-menu-toggle
          {...(settingsOpen ? { 'data-chaos-settings-hidden': '' } : {})}
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <IconPanelLeftOutline16 size={20} />
        </button>
        {/* Back — visible while details is open (CSS drives visibility). */}
        <button
          type="button"
          className={css.button}
          data-chaos-back
          {...(settingsOpen ? { 'data-chaos-settings-back': '' } : {})}
          onClick={settingsOpen ? closeSettings : closeDetails}
          aria-label="Back"
        >
          <IconChevronLeftOutline14 size={20} />
        </button>
      </div>
      <div className={css.title} aria-live="polite">
        <span className={css.titleText}>{settingsOpen ? '设置' : title}</span>
        {!settingsOpen && mode !== undefined && <span className={css.mode}>{mode} 模式</span>}
      </div>
      <div className={css.right}>
        <button
          type="button"
          className={css.button}
          data-chaos-overflow
          {...(settingsOpen ? { 'data-chaos-settings-hidden': '' } : {})}
          aria-label="More"
          onClick={openOverflow}
        >
          <IconEllipsisOutline16 size={20} />
        </button>
      </div>
    </nav>
  )
}
