import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE } from '../src/session-store.ts'
import { apply } from '../src/index.ts'

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/**
 * Capture named routes without opening a listener. The surface deliberately
 * omits registerGuard/registerUpgradeGuard so apply picks route mode.
 */
function routingServer() {
  const routes = new Map<string, Handler>()
  return {
    host: '0.0.0.0' as const,
    register: (route: { path: string; handler: Handler }) => {
      routes.set(route.path, route.handler)
      return () => { routes.delete(route.path) }
    },
    get routes() { return routes },
  }
}

/** Record one response without creating a server. */
function response() {
  let status: number | undefined
  const headers: Record<string, string> = {}
  let body = ''
  return {
    writeHead: (next: number, head: Record<string, string> = {}) => {
      status = next
      Object.assign(headers, head)
    },
    end: (next?: string) => { body = next ?? '' },
    get result() { return { status, headers, body } },
  }
}

/** Request factory with an optional form body consumed by readBody. */
function request(url: string, init: { method?: string; cookie?: string; body?: string } = {}): IncomingMessage {
  const chunks: string[] = init.body === undefined ? [] : [init.body]
  return {
    url,
    method: init.method ?? 'GET',
    headers: init.cookie === undefined ? {} : { cookie: init.cookie },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Buffer.from(chunk)
    },
  } as unknown as IncomingMessage
}

describe('chaos-auth root gate route (published webserver)', () => {
  it('redirects unauthenticated entry to the login page and authenticated entry to the index', async () => {
    const ctx = new Context()
    const webServer = routingServer()
    const delegated: string[] = []
    ctx.provide('webServer', webServer as never)
    ctx.provide('connection', {
      authenticatedUrl: (base: string) => `${base}?token=launch`,
      authorizeIndex: (req: IncomingMessage) => {
        delegated.push(req.url ?? '')
        return true
      },
    } as never)
    ctx.provide('credentials', { resolve: async () => ({ value: 'test_token' }) } as never)
    const fiber = ctx.plugin(() =>{  apply(ctx, {
      idleTimeoutMs: 60_000,
      absoluteTimeoutMs: 120_000,
      tokenRef: 'test_token',
      publicUrl: 'http://10.10.10.10:3080',
    }) })
    await fiber.await()
    expect(webServer.routes.get('/')).toBeDefined()
    expect(webServer.routes.get('/auth/login')).toBeDefined()
    expect(webServer.routes.get('/auth/logout')).toBeDefined()
    await Promise.resolve()
    await Promise.resolve()

    // Unauthenticated entry: redirect to the login page, query dropped.
    const anonymous = response()
    await webServer.routes.get('/')!(request('/?other=x', { cookie: 'other=x' }), anonymous as never)
    expect(anonymous.result.status).toBe(302)
    expect(anonymous.result.headers.location).toBe('/auth/login')

    // Launch-token entry is delegated to client-connection's index
    // authorizer at '/' — the only pathname where it consumes the token.
    await webServer.routes.get('/')!(request('/?token=launch'), response() as never)
    expect(delegated).toEqual(['/?token=launch'])

    // Login: valid token sets the session cookie and redirects to the
    // client-connection authenticated URL.
    const login = response()
    await webServer.routes.get('/auth/login')!(request('/auth/login', { method: 'POST', body: 'token=test_token' }), login as never)
    expect(login.result.status).toBe(302)
    expect(login.result.headers.location).toBe('http://10.10.10.10:3080?token=launch')
    const cookie = login.result.headers['set-cookie']?.split(';')[0]
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`))

    // Authenticated entry without a token: redirect to the index.
    const authed = response()
    await webServer.routes.get('/')!(request('/', { cookie: cookie! }), authed as never)
    expect(authed.result.status).toBe(302)
    expect(authed.result.headers.location).toBe('/index.html')
    await fiber.dispose()
  })
})
