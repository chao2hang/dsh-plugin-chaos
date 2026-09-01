import { describe, it, expect } from 'vitest'
import {
  computeColumns, clampWidth, MOBILE_BREAKPOINT, MOBILE_LANDSCAPE_MAX_HEIGHT, isMobileViewport,
  CENTER_MIN, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT,
  DETAILS_DEFAULT, DETAILS_MIN,
} from '../src/client/columns.ts'

describe('clampWidth', () => {
  it('clamps below the minimum', () => {
    expect(clampWidth(100, 200, 400)).toBe(200)
  })
  it('clamps above the maximum', () => {
    expect(clampWidth(500, 200, 400)).toBe(400)
  })
  it('rounds to integer', () => {
    expect(clampWidth(280.7, 200, 400)).toBe(281)
  })
  it('keeps in-range values', () => {
    expect(clampWidth(300, 200, 400)).toBe(300)
  })
})

describe('computeColumns', () => {
  it('fits all three columns at wide viewport', () => {
    const cols = computeColumns(1920, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(cols.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(cols.details).toBe(DETAILS_DEFAULT)
    expect(cols.center).toBe(1920 - SIDEBAR_DEFAULT - DETAILS_DEFAULT)
  })

  it('collapses sidebar to rail when preference is 0', () => {
    const cols = computeColumns(1024, 0, 0)
    expect(cols.sidebar).toBe(SIDEBAR_COLLAPSED)
    expect(cols.details).toBe(0)
  })

  it('shrinks details toward minimum before touching center', () => {
    // viewport too small for default details but enough for min
    const viewport = SIDEBAR_DEFAULT + DETAILS_MIN + CENTER_MIN + 50
    const cols = computeColumns(viewport, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(cols.details).toBeGreaterThanOrEqual(DETAILS_MIN)
    expect(cols.center).toBe(CENTER_MIN)
  })

  it('auto-closes details when viewport is too small', () => {
    const cols = computeColumns(400, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(cols.details).toBe(0)
    expect(cols.sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('MOBILE_BREAKPOINT is 768', () => {
    expect(MOBILE_BREAKPOINT).toBe(768)
  })

  it('MOBILE_LANDSCAPE_MAX_HEIGHT is 500', () => {
    expect(MOBILE_LANDSCAPE_MAX_HEIGHT).toBe(500)
  })

  describe('isMobileViewport', () => {
    it('fires below the width breakpoint (portrait phone)', () => {
      expect(isMobileViewport(393, 852)).toBe(true)
      expect(isMobileViewport(767, 1024)).toBe(true)
    })
    it('holds above the width breakpoint (desktop, tablet landscape)', () => {
      expect(isMobileViewport(1440, 900)).toBe(false)
      expect(isMobileViewport(1024, 768)).toBe(false)
    })
    it('fires for a short landscape viewport (rotated phone) even when wide', () => {
      expect(isMobileViewport(852, 393)).toBe(true)
      expect(isMobileViewport(740, 360)).toBe(true)
    })
    it('keeps the boundary heights on desktop', () => {
      expect(isMobileViewport(1280, MOBILE_LANDSCAPE_MAX_HEIGHT)).toBe(false)
      expect(isMobileViewport(1280, MOBILE_LANDSCAPE_MAX_HEIGHT - 1)).toBe(true)
    })
  })

  it('center absorbs deficit at very narrow viewport', () => {
    // sidebar preference 0 = closed → SIDEBAR_COLLAPSED rail (56px)
    const cols = computeColumns(360, 0, 0)
    expect(cols.sidebar).toBe(SIDEBAR_COLLAPSED)
    expect(cols.details).toBe(0)
    expect(cols.center).toBe(360 - SIDEBAR_COLLAPSED)
  })
})
