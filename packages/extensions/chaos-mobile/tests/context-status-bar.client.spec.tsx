// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { ContextStatusBar, type ContextStatusBarProps } from '../src/client/ContextStatusBar.tsx'
import {
  getChaosContextMeter, publishChaosContextMeter, subscribeChaosContextMeter, formatContextTokens,
} from '../src/client/context-meter-store.ts'

afterEach(() => {
  cleanup()
  publishChaosContextMeter(undefined)
})

/** Render the bar against fake projection reads. */
function bar(pressure: unknown, breakdown?: unknown) {
  const useProjection = (key: string) =>
    key === 'contextPressure' ? pressure : key === 'contextBreakdown' ? breakdown : undefined
  return render(<ContextStatusBar {...({ useProjection } as unknown as ContextStatusBarProps)} />)
}

describe('ContextStatusBar', () => {
  it('renders nothing until both numerator and capacity are known', () => {
    const view = bar(undefined)
    expect(document.querySelector('[data-chaos-context-bar]')).toBeNull()
    bar({ pressureTokens: 100 })
    expect(document.querySelector('[data-chaos-context-bar]')).toBeNull()
    bar({ contextWindow: 1000 })
    expect(document.querySelector('[data-chaos-context-bar]')).toBeNull()
    view.unmount()
  })

  it('renders a fill at the bounded percent and publishes the folded meter', () => {
    bar({ pressureTokens: 450, contextWindow: 1000 }, {
      systemTokens: 100, toolsTokens: 50, messageTokens: 300,
    })
    const barEl = document.querySelector('[data-chaos-context-bar]')!
    expect(barEl.getAttribute('data-chaos-context-bar')).toBe('ok')
    const fill = barEl.querySelector<HTMLDivElement>('[data-chaos-context-bar-fill]')!
    expect(fill.style.width).toBe('45%')
    expect(getChaosContextMeter()).toEqual({
      percent: 45,
      usedTokens: 450,
      contextWindow: 1000,
      breakdown: { systemTokens: 100, toolsTokens: 50, messageTokens: 300 },
    })
  })

  it('prefers the projected (next-request) figure over the provider sample', () => {
    bar({ pressureTokens: 200, projectedTokens: 320, contextWindow: 1000 })
    expect(getChaosContextMeter()?.percent).toBe(32)
  })

  it('caps the occupancy at 100 and escalates the tint at warn and danger', () => {
    bar({ pressureTokens: 2000, contextWindow: 1000 })
    let barEl = document.querySelector('[data-chaos-context-bar]')!
    expect(barEl.getAttribute('data-chaos-context-bar')).toBe('danger')
    expect(barEl.querySelector<HTMLDivElement>('[data-chaos-context-bar-fill]')!.style.width).toBe('100%')
    cleanup()
    bar({ pressureTokens: 750, contextWindow: 1000 })
    barEl = document.querySelector('[data-chaos-context-bar]')!
    expect(barEl.getAttribute('data-chaos-context-bar')).toBe('warn')
    cleanup()
    bar({ pressureTokens: 490, contextWindow: 1000 })
    barEl = document.querySelector('[data-chaos-context-bar]')!
    expect(barEl.getAttribute('data-chaos-context-bar')).toBe('ok')
  })

  it('clears the published meter when the entry unmounts', () => {
    bar({ pressureTokens: 450, contextWindow: 1000 })
    expect(getChaosContextMeter()).toBeDefined()
    cleanup()
    expect(getChaosContextMeter()).toBeUndefined()
  })

  it('stays hidden while the dedicated settings page covers the conversation', async () => {
    // The overlay is already up at mount: the bar never appears.
    const overlay = document.createElement('div')
    overlay.setAttribute('data-settings-overlay', '')
    document.body.appendChild(overlay)
    bar({ pressureTokens: 450, contextWindow: 1000 })
    expect(document.querySelector('[data-chaos-context-bar]')).toBeNull()
    cleanup()
    overlay.remove()

    // The overlay mounts and unmounts around a mounted bar.
    bar({ pressureTokens: 450, contextWindow: 1000 })
    expect(document.querySelector('[data-chaos-context-bar]')).not.toBeNull()
    act(() => { overlay.remove(); document.body.appendChild(overlay) })
    await act(async () => {})
    expect(document.querySelector('[data-chaos-context-bar]')).toBeNull()
    act(() => { overlay.remove() })
    await act(async () => {})
    expect(document.querySelector('[data-chaos-context-bar]')).not.toBeNull()
    // Hiding the bar keeps the store published for the overflow sheet.
    expect(getChaosContextMeter()?.percent).toBe(45)
  })
})

describe('context meter store', () => {
  it('notifies once per distinct value and stops notifying disposed subscribers', () => {
    const first = vi.fn()
    const second = vi.fn()
    const dispose1 = subscribeChaosContextMeter(first)
    const dispose2 = subscribeChaosContextMeter(second)
    const value = { percent: 10, usedTokens: 100, contextWindow: 1000, breakdown: undefined }
    act(() => { publishChaosContextMeter(value) })
    act(() => { publishChaosContextMeter(value) })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    act(() => { publishChaosContextMeter(undefined) })
    expect(first).toHaveBeenCalledTimes(2)
    dispose1()
    dispose2()
    act(() => { publishChaosContextMeter(value) })
    act(() => { publishChaosContextMeter(undefined) })
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(getChaosContextMeter()).toBeUndefined()
  })
})

describe('formatContextTokens', () => {
  it('counts raw, K, and M with one decimal under the round threshold', () => {
    expect(formatContextTokens(999)).toBe('999')
    expect(formatContextTokens(1_234)).toBe('1.2K')
    expect(formatContextTokens(123_456)).toBe('123K')
    expect(formatContextTokens(2_345_678)).toBe('2.3M')
  })
})
