// @vitest-environment jsdom
// The browser port over the two host routes. The restart route answers BEFORE
// the process exits, so a resolved ack means "accepted", never "already back";
// these pin that reading plus the failure translations.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRestartPort } from '../src/client/restart-port.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function stubFetch(responder: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const body = responder(url, init)
    return Promise.resolve(body as Response)
  })
  globalThis.fetch = fetchMock as never
  return fetchMock
}

describe('restart port', () => {
  it('reports the host capability', async () => {
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({ canRestart: true }) }))
    await expect(createRestartPort().status()).resolves.toEqual({ canRestart: true })
  })

  it('treats an unreachable or failing status route as unsupported', async () => {
    stubFetch(() => ({ ok: false, status: 503, json: () => Promise.resolve({}) }))
    await expect(createRestartPort().status()).resolves.toEqual({ canRestart: false })
  })

  it('defaults a malformed status body to unsupported rather than assuming yes', async () => {
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({}) }))
    await expect(createRestartPort().status()).resolves.toEqual({ canRestart: false })
  })

  it('POSTs the restart and resolves the acknowledgement', async () => {
    const fetchMock = stubFetch(() => ({ ok: true, json: () => Promise.resolve({ ok: true }) }))
    await expect(createRestartPort().restart()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/system/restart', { method: 'POST' })
  })

  it('surfaces the host reason when the restart is refused', async () => {
    stubFetch(() => ({ ok: false, status: 503, json: () => Promise.resolve({ ok: false, reason: 'restart not supported' }) }))
    await expect(createRestartPort().restart()).resolves.toEqual({ ok: false, reason: 'restart not supported' })
  })

  it('names the status when the host refuses without a reason', async () => {
    stubFetch(() => ({ ok: false, status: 405, json: () => Promise.reject(new Error('no body')) }))
    await expect(createRestartPort().restart()).resolves.toEqual({
      ok: false,
      reason: 'restart request failed (405)',
    })
  })
})
