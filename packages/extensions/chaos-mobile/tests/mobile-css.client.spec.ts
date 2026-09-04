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

  it('nav bar back button visibility driven by data-details-collapsed', () => {
    expect(css).toContain('[data-chaos-back]')
    expect(css).toContain(':not([data-details-collapsed])')
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
})
