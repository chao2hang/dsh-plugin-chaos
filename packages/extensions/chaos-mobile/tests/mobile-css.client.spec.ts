import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cssPath = resolve(import.meta.dirname, '../src/styles/mobile.css')
const css = readFileSync(cssPath, 'utf8')

describe('mobile.css contract', () => {
  it('keys layout rules off the html[data-chaos-mobile] mode attribute', () => {
    // The mode decision lives in one place (MobileOverlay's isMobileViewport,
    // which also covers short landscape viewports); CSS must not re-derive a
    // width-only media answer that diverges from the nav bar switch.
    expect(css).toContain('html[data-chaos-mobile]')
    expect(css).not.toContain('max-width: 767px')
  })

  it('tracks Visual Viewport height and offset for keyboard panning', () => {
    expect(css).toContain('height: var(--chaos-visual-viewport-height, 100%)')
    expect(css).toContain('translateY(var(--chaos-visual-viewport-offset-top, 0px))')
    expect(css).not.toContain('--chaos-keyboard-inset')
  })

  it('uses 100dvh for dynamic viewport height', () => {
    expect(css).toContain('100dvh')
  })

  it('includes safe-area-inset for notch/home indicator', () => {
    expect(css).toContain('env(safe-area-inset-')
  })

  it('places the sidebar drawer below the persistent mobile header', () => {
    expect(css).toContain('top: calc(44px + env(safe-area-inset-top, 0)) !important')
  })

  it('presents settings as a dedicated page below the mobile header', () => {
    expect(css).toContain('[data-settings-overlay]')
    expect(css).toContain('[data-settings-page-section]')
    expect(css).toContain('flex-direction: column')
  })

  it('keeps the settings section nav a one-line scrollable chip row', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-settings-page-sections] {')
    expect(css).toContain('overflow-x: auto')
    expect(css).not.toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })

  it('reflows the appearance cubes into one compact row on mobile', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-appearance-cubes] {')
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  it('targets only anchors the model-capability sheet emits', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-model-capabilities-capacity] button {')
    expect(css).toContain('min-height: 36px')
    expect(css).not.toContain('[data-model-capabilities-field]')
    expect(css).not.toContain('[data-model-capabilities-trigger]')
  })

  it('centers the slash menu at viewport width above the composer', () => {
    expect(css).toContain('width: calc(100vw - 24px)')
    expect(css).toContain('transform: translateX(-50%)')
  })

  it('targets data-shell-column anchors instead of [class*=] selectors', () => {
    expect(css).toContain("data-shell-column='sidebar'")
    expect(css).toContain("data-shell-column='center'")
    expect(css).toContain("data-shell-column='details'")
  })

  it('targets data-shell-handle for drag handle hiding', () => {
    expect(css).toContain('data-shell-handle')
  })

  it('targets data-shell-frame for frame-level state', () => {
    expect(css).toContain('data-shell-frame')
  })

  it('falls back to structural slot anchors for frontends without data-shell-frame', () => {
    // Released frontends (0.1.2-rc.1 and older) mark neither the frame nor
    // the columns with data-shell-* hooks. The slot render sites are direct
    // children of the columns in both lineages, so the column anchor is the
    // element whose direct child carries the slot name, and the frame is the
    // direct parent of the data-shell-overlay layer.
    expect(css).toContain(":has(> [data-slot='sidebar'])")
    expect(css).toContain(":has(> [data-slot='conversation'])")
    expect(css).toContain(":has(> [data-slot='details'])")
    expect(css).toContain(':has(> [data-shell-overlay])')
    // Frame state is probed at the html level: only the frame carries the
    // collapsed attributes in any frontend.
    expect(css).toContain(':not(:has([data-sidebar-collapsed]))')
    expect(css).toContain(':not(:has([data-details-collapsed]))')
  })

  it('keeps nested :has() out of the stylesheet', () => {
    // Current Chromium rejects :has(:has(...)) as an invalid selector and
    // drops the whole rule, silently breaking the layout it guards.
    expect(css).not.toContain(':has(> :has(')
    expect(css).not.toContain(':has(:has(')
  })

  it('has at most one [class*= selector (headerUtilities known limitation)', () => {
    const matches = css.match(/\[class\*=/g) ?? []
    // One is the comment, one is the headerUtilities selector.
    expect(matches.length).toBeLessThanOrEqual(2)
  })

  it('sidebar becomes fixed drawer on mobile', () => {
    expect(css).toContain('position: fixed')
    expect(css).toContain('transform: translateX(-100%)')
  })

  it('sidebar slides in when data-sidebar-collapsed is absent', () => {
    expect(css).toContain(':not([data-sidebar-collapsed])')
    expect(css).toContain('translateX(0)')
  })

  it('details column becomes full-screen overlay on mobile', () => {
    expect(css).toContain("data-shell-column='details'")
    expect(css).toContain('width: 100%')
  })

  it('shows the details sheet from the chaos-owned push-page state on narrow viewports', () => {
    // The core column solver never renders an open details column below its
    // 640px center floor, so the frame attribute is a dead signal there; the
    // push-page state on <html> must carry the visible/hidden decision.
    expect(css).toContain('[data-chaos-details-open] [data-shell-column=\'details\']')
    expect(css).toContain('[data-chaos-details-open] :has(> [data-slot=\'details\'])')
  })

  it('drag handles hidden on mobile via data-shell-handle', () => {
    expect(css).toContain('[data-shell-handle]')
    expect(css).toContain('display: none')
  })

  it('respects prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('includes landscape adaptation for short screens', () => {
    expect(css).toContain('orientation: landscape')
    expect(css).toContain('max-height: 500px')
  })

  it('prevents horizontal scroll on mobile', () => {
    expect(css).toContain('overflow-x: hidden')
  })

  it('truncates long titles', () => {
    expect(css).toContain('text-overflow: ellipsis')
  })

  it('keeps the duplicated desktop session header out of the mobile workspace', () => {
    expect(css).toContain('[data-conversation-session-header]')
    expect(css).toContain('display: none !important')
  })

  it('nav bar back button visibility driven by data-details-collapsed or the push-page state', () => {
    expect(css).toContain('[data-chaos-back]')
    expect(css).toContain(':not([data-details-collapsed])')
    expect(css).toContain('[data-chaos-details-open] [data-chaos-mobile-overlay] [data-chaos-back]')
    expect(css).toContain('[data-chaos-details-open] [data-chaos-mobile-overlay] [data-chaos-menu-toggle]')
  })

  it('coarse pointer media query for touch target enlargement', () => {
    expect(css).toContain('pointer: coarse')
  })

  it('hover-none media query disables hover affordances', () => {
    expect(css).toContain('hover: none')
  })

  it('hides the command slash button on every viewport', () => {
    expect(css).toContain('[data-composer-modes] > button[aria-haspopup="listbox"]')
    expect(css).not.toContain('html[data-chaos-mobile] [data-composer-modes] > button[aria-haspopup="listbox"]')
    expect(css).toContain('display: none !important')
  })

  it('hides the composer built-in paperclip by anchor, not by locale label', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-composer-card] [data-composer-attach]')
    expect(css).not.toContain('aria-label="添加附件"')
    expect(css).not.toContain('aria-label="Add attachment"')
  })

  it('hides the bottom stats line and message clocks on mobile (mirrored in the overflow sheet)', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-stats-line]')
    expect(css).toContain('html[data-chaos-mobile] [data-message-clock]')
    expect(css).toContain('display: none !important')
  })

  it('moves the context ring out of the mobile rail to the top status bar', () => {
    expect(css).toContain('html[data-chaos-mobile] [data-composer-card] [data-composer-context]')
    expect(css).toContain('[data-chaos-context-bar] {')
    expect(css).toContain('top: calc(44px + env(safe-area-inset-top, 0))')
    expect(css).toContain('[data-chaos-context-bar-fill]')
    expect(css).toContain("[data-chaos-context-bar='warn']")
    expect(css).toContain("[data-chaos-context-bar='danger']")
  })
})
