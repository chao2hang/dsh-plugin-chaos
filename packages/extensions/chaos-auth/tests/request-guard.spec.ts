import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

type Guard = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>

/** Capture the auth guard without opening an HTTP listener. */
function guardedServer() {
  let guard: Guard | undefined
  return {
    host: '0.0.0.0' as const,
    register: () => () => {},
    registerUpgradeGuard: () => () => {},
    registerGuard: (next: Guard) => {
      guard = next
      return () => { guard = undefined }
    },
    markAuthenticated: () => {},
    get guard() { return guard },
  }
}

/** Record an HTTP guard's response without creating a server. */
function response() {
  let status: number | undefined
  let body = ''
  return {
    writeHead: (next: number) => { status = next },
    end: (next?: string) => { body = next ?? '' },
    get result() { return { status, body } },
  }
}

describe('chaos-auth request guard', () => {
  it('allows only the PWA manifest among unauthenticated static paths', async () => {
    const ctx = new Context()
    const webServer = guardedServer()
    ctx.provide('webServer', webServer as never)
    const fiber = ctx.plugin(() =>{  apply(ctx, {
      idleTimeoutMs: 1_000,
      absoluteTimeoutMs: 2_000,
      tokenRef: 'test-token',
      publicUrl: '',
    }) })
    await fiber.await()
    const guard = webServer.guard
    expect(guard).toBeDefined()

    const manifest = response()
    expect(guard!({ url: '/manifest.webmanifest', headers: { accept: '*/*' } } as IncomingMessage, manifest as never)).toBe(true)
    expect(manifest.result.status).toBeUndefined()

    const asset = response()
    expect(guard!({ url: '/favicon.svg', headers: { accept: '*/*' } } as IncomingMessage, asset as never)).toBe(false)
    expect(asset.result).toEqual({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    await fiber.dispose()
  })
})
