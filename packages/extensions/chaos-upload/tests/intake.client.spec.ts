// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { installDesktopFileIntake, isRasterImage } from '../src/client/intake.ts'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

const sessionId = 's1' as SessionId

/** Fire one synthetic paste or drop carrying the given files at a target. */
function fireFiles(kind: 'paste' | 'drop', files: File[], target: Element): { canceled: boolean; reachedCore: boolean } {
  const event = new Event(kind, { cancelable: true, bubbles: true })
  Object.defineProperty(event, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files } })
  let reachedCore = false
  document.addEventListener(kind, () => { reachedCore = true })
  target.dispatchEvent(event)
  return { canceled: event.defaultPrevented, reachedCore }
}

describe('isRasterImage', () => {
  it('accepts exactly the four core raster types', () => {
    expect(isRasterImage(new File([], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isRasterImage(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isRasterImage(new File([], 'a.webp', { type: 'image/webp' }))).toBe(true)
    expect(isRasterImage(new File([], 'a.gif', { type: 'image/gif' }))).toBe(true)
    expect(isRasterImage(new File([], 'a.svg', { type: 'image/svg+xml' }))).toBe(false)
    expect(isRasterImage(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})

describe('installDesktopFileIntake', () => {
  /** A composer card with a paste target inside, mirroring the InputBar DOM. */
  function composer(): { card: HTMLElement; inner: HTMLElement } {
    document.body.innerHTML = ''
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    const inner = document.createElement('div')
    inner.setAttribute('contenteditable', 'true')
    card.appendChild(inner)
    document.body.appendChild(card)
    return { card, inner }
  }

  it('routes a document paste inside the composer and stops the core intake', () => {
    const { inner } = composer()
    const routeFiles = vi.fn()
    const dispose = installDesktopFileIntake({ currentSessionId: () => sessionId, routeFiles })
    const pdf = new File([new Uint8Array([1])], '报告.pdf', { type: 'application/pdf' })
    const outcome = fireFiles('paste', [pdf], inner)
    expect(routeFiles).toHaveBeenCalledWith(sessionId, [pdf])
    expect(outcome.canceled).toBe(true)
    expect(outcome.reachedCore).toBe(false)
    dispose()
  })

  it('keeps a raster-only paste on the core image path', () => {
    const { inner } = composer()
    const routeFiles = vi.fn()
    const dispose = installDesktopFileIntake({ currentSessionId: () => sessionId, routeFiles })
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    const outcome = fireFiles('paste', [png], inner)
    expect(routeFiles).not.toHaveBeenCalled()
    expect(outcome.canceled).toBe(false)
    expect(outcome.reachedCore).toBe(true)
    dispose()
  })

  it('ignores a document paste outside the composer card', () => {
    document.body.innerHTML = ''
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    const routeFiles = vi.fn()
    const dispose = installDesktopFileIntake({ currentSessionId: () => sessionId, routeFiles })
    const pdf = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const outcome = fireFiles('paste', [pdf], outside)
    expect(routeFiles).not.toHaveBeenCalled()
    expect(outcome.canceled).toBe(false)
    dispose()
  })

  it('routes a mixed drop anywhere on the page and ends the drag for the overlay', () => {
    const { card } = composer()
    const routeFiles = vi.fn()
    const dragEnds = vi.fn()
    window.addEventListener('dragend', dragEnds)
    const dispose = installDesktopFileIntake({ currentSessionId: () => sessionId, routeFiles })
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    const pdf = new File([new Uint8Array([2])], 'a.pdf', { type: 'application/pdf' })
    const outcome = fireFiles('drop', [png, pdf], card)
    expect(routeFiles).toHaveBeenCalledWith(sessionId, [png, pdf])
    expect(outcome.canceled).toBe(true)
    expect(outcome.reachedCore).toBe(false)
    expect(dragEnds).toHaveBeenCalledTimes(1)
    window.removeEventListener('dragend', dragEnds)
    dispose()
  })

  it('leaves the event untouched without a current session', () => {
    const { inner } = composer()
    const routeFiles = vi.fn()
    const dispose = installDesktopFileIntake({ currentSessionId: () => undefined, routeFiles })
    const pdf = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const outcome = fireFiles('paste', [pdf], inner)
    expect(routeFiles).not.toHaveBeenCalled()
    expect(outcome.canceled).toBe(false)
    dispose()
  })

  it('stops intercepting after disposal', () => {
    const { inner } = composer()
    const routeFiles = vi.fn()
    const dispose = installDesktopFileIntake({ currentSessionId: () => sessionId, routeFiles })
    dispose()
    const pdf = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const outcome = fireFiles('paste', [pdf], inner)
    expect(routeFiles).not.toHaveBeenCalled()
    expect(outcome.canceled).toBe(false)
    dispose()
  })
})
