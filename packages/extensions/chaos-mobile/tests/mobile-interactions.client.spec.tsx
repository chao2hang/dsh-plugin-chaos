// @vitest-environment jsdom
/**
 * Mobile interaction behavior tests: reduced-motion CSS, keyboard inset hook,
 * and back-button history chain.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useKeyboardInset } from '../src/client/useKeyboardInset.ts'
import { MobileOverlay } from '../src/client/MobileOverlay.tsx'
import { MOBILE_BREAKPOINT } from '../src/client/columns.ts'
import { resetSurfacePresentation } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect } from 'react'

afterEach(() => {
  cleanup()
  resetSurfacePresentation()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  // Restore visualViewport if mocked
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined, writable: true })
})

describe('reduced-motion — CSS degradation', () => {
  const sheetCss = readFileSync(resolve(import.meta.dirname, '../src/client/MobileSheet.module.css'), 'utf8')
  const mobileCss = readFileSync(resolve(import.meta.dirname, '../src/styles/mobile.css'), 'utf8')

  it('MobileSheet CSS disables animations under prefers-reduced-motion', () => {
    expect(sheetCss).toContain('prefers-reduced-motion: reduce')
    expect(sheetCss).toContain('animation: none')
    expect(sheetCss).toContain('transition: none')
  })

  it('mobile.css disables transitions under prefers-reduced-motion', () => {
    expect(mobileCss).toContain('prefers-reduced-motion: reduce')
    expect(mobileCss).toContain('animation: none')
    expect(mobileCss).toContain('transition: none')
  })
})

describe('useKeyboardInset — visual viewport tracking', () => {
  it('returns 0 when visualViewport is undefined (desktop)', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined, writable: true })

    function HookProbe(): null {
      const inset = useKeyboardInset()
      expect(inset).toBe(0)
      return null
    }
    render(<HookProbe />)
  })

  it('tracks keyboard height as layoutHeight - visualHeight', () => {
    const listeners: Record<string, Set<() => void>> = { resize: new Set(), scroll: new Set() }
    let visualHeight = 800
    const mockVV = {
      get height() { return visualHeight },
      addEventListener: (event: string, cb: () => void) => { listeners[event]?.add(cb) },
      removeEventListener: (event: string, cb: () => void) => { listeners[event]?.delete(cb) },
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: mockVV, writable: true })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })

    const results: number[] = []
    function HookProbe(): null {
      const inset = useKeyboardInset()
      useEffect(() => { results.push(inset) })
      return null
    }
    render(<HookProbe />)

    expect(results.at(-1)).toBe(200)

    // Simulate keyboard closing
    visualHeight = 1000
    const resizeListeners = listeners.resize
    if (resizeListeners !== undefined) {
      act(() => { resizeListeners.forEach((cb) => { cb() }) })
    }
    expect(results.at(-1)).toBe(0)

    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined, writable: true })
  })
})

describe('back-button — history chain', () => {
  it('MobileOverlay back button calls history.back()', () => {
    const backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})
    vi.spyOn(history, 'pushState').mockImplementation(() => {})

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: MOBILE_BREAKPOINT - 1 })

    const props = {
      toggleSidebar: vi.fn(),
      closeDetails: vi.fn(),
      // Standard seat hook stubbed to an empty sessions snapshot: this test
      // exercises the back-button history path, not the session summary.
      useSessions: (selector: (state: unknown) => unknown) => selector({ current: undefined, byId: {} }),
    } as unknown as React.ComponentProps<typeof MobileOverlay>
    const { getByLabelText } = render(<MobileOverlay {...props} />)

    fireEvent.click(getByLabelText('Back'))

    expect(backSpy).toHaveBeenCalledTimes(1)
    backSpy.mockRestore()
    vi.restoreAllMocks()
  })
})
