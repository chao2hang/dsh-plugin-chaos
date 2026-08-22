import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cssPath = resolve(import.meta.dirname, '../src/styles/mobile.css')
const css = readFileSync(cssPath, 'utf8')

describe('mobile.css contract', () => {
  it('targets max-width 767px for mobile breakpoint', () => {
    expect(css).toContain('max-width: 767px')
  })

  it('uses 100dvh for dynamic viewport height', () => {
    expect(css).toContain('100dvh')
  })

  it('includes safe-area-inset for notch/home indicator', () => {
    expect(css).toContain('env(safe-area-inset-')
  })

  it('sets minimum 44px touch target for buttons', () => {
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('min-width: 44px')
  })

  it('transforms popups into bottom sheets (fixed bottom, rounded top)', () => {
    expect(css).toContain('position: fixed')
    expect(css).toContain('bottom: 0')
    expect(css).toContain('border-radius: 16px 16px 0 0')
    expect(css).toContain('max-height: 85vh')
  })

  it('includes slide-up animation for bottom sheets', () => {
    expect(css).toContain('chaos-slide-up')
    expect(css).toContain('translateY(100%)')
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
})

describe('ChaosAppFrame.module.css contract', () => {
  const frameCssPath = resolve(import.meta.dirname, '../src/client/ChaosAppFrame.module.css')
  const frameCss = readFileSync(frameCssPath, 'utf8')

  it('desktop frame uses grid layout', () => {
    expect(frameCss).toContain('display: grid')
  })

  it('drawer sidebar is fixed position with translateX', () => {
    expect(frameCss).toContain('position: fixed')
    expect(frameCss).toContain('transform: translateX(-100%)')
  })

  it('drawer open state slides in', () => {
    expect(frameCss).toContain('translateX(0)')
  })

  it('details overlay is fixed full screen', () => {
    expect(frameCss).toContain('inset: 0')
  })

  it('backdrop has semi-transparent background', () => {
    expect(frameCss).toContain('rgba(0, 0, 0, 0.45)')
  })

  it('hamburger button is 40px touch target', () => {
    expect(frameCss).toContain('width: 40px')
    expect(frameCss).toContain('height: 40px')
  })

  it('uses safe-area-inset for drawer and hamburger', () => {
    expect(frameCss).toContain('env(safe-area-inset-left')
    expect(frameCss).toContain('env(safe-area-inset-top')
  })
})
