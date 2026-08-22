/**
 * @deepseek-ai/dsh-plugin-chaos-auth — Remote access authentication plugin.
 * Registers request and upgrade guards on the webserver: unauthenticated
 * requests receive a minimal login page (for page requests) or 401 (for API
 * requests); authenticated requests pass through with refreshed session
 * activity. Login/logout endpoints are public named routes.
 *
 * Security model:
 * - Default: loopback HTTP stays anonymous (existing behavior unchanged).
 * - When webserver binds 0.0.0.0: the plugin activates and requires a token.
 * - Token is resolved through the credentials system (never plaintext config).
 * - Session cookies: HttpOnly + SameSite=Strict; Secure under HTTPS.
 * - Sliding idle expiry + absolute lifetime cap; cookie max-age is the min.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-auth
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-credentials'
import {
  SessionStore, constantTimeEqual, extractSessionId, buildCookie, clearCookie,
  DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_ABSOLUTE_TIMEOUT_MS,
  type SessionStoreConfig,
} from './session-store.ts'

/** Stable Cordis plugin name. */
export const name = 'chaos-auth'

/** Required services: the web server (for guard/route registration). */
export const inject = ['webServer']

/** Plugin configuration. */
export interface Config {
  /** Idle timeout in ms (default: 7 days). */
  idleTimeoutMs: number
  /** Absolute timeout in ms (default: 30 days). Must be >= idleTimeoutMs. */
  absoluteTimeoutMs: number
  /**
   * Credential reference for the login token. Resolved through the
   * credentials system at startup; the token value never appears in config.
   */
  tokenRef: string
  /**
   * Public URL when behind a reverse proxy that terminates TLS. When set,
   * the plugin trusts the URL's hostname for the trust fence but does not
   * trust forwarding headers (the Host fence handles DNS rebinding defense).
   */
  publicUrl: string
}

export const Config: z<Config> = z.object({
  idleTimeoutMs: z.natural().default(DEFAULT_IDLE_TIMEOUT_MS),
  absoluteTimeoutMs: z.natural().default(DEFAULT_ABSOLUTE_TIMEOUT_MS),
  tokenRef: z.string().default('DSH_AUTH_TOKEN'),
  publicUrl: z.string().default(''),
})

/** Re-export security utilities for testing. */
export { SessionStore, constantTimeEqual, extractSessionId, buildCookie, clearCookie, cookieMaxAge } from './session-store.ts'
export type { SessionStoreConfig } from './session-store.ts'

/** Login page HTML: minimal, no app code loaded. */
function loginPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepSeek Harness — Login</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:var(--bg,#1a1a2e);color:#e0e0e0}
.card{background:#16213e;padding:2rem;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.3);width:min(360px,90vw)}
h1{font-size:1.25rem;margin:0 0 1.5rem;text-align:center}
input{width:100%;padding:0.75rem;margin:0.5rem 0;border:1px solid #333;border-radius:8px;background:#0f3460;color:#e0e0e0;box-sizing:border-box;font-size:1rem}
button{width:100%;padding:0.75rem;margin-top:1rem;border:none;border-radius:8px;background:#e94560;color:#fff;font-size:1rem;cursor:pointer;min-height:44px}
button:active{background:#c73650}
.error{color:#e94560;font-size:0.875rem;margin-top:0.5rem;display:none}
</style>
</head>
<body>
<div class="card">
<h1>DeepSeek Harness</h1>
<form method="POST" action="/auth/login">
<input type="password" name="token" placeholder="Access token" autocomplete="current-password" autofocus>
<button type="submit">Login</button>
<div class="error" id="err">Invalid token</div>
</form>
</div>
</body>
</html>`
}

/** Whether a request is a page request (accepts HTML) vs an API request. */
function isPageRequest(req: IncomingMessage): boolean {
  const accept = req.headers.accept ?? ''
  return accept.includes('text/html')
}

/** Whether the request path is a public auth endpoint. */
function isAuthEndpoint(pathname: string): boolean {
  return pathname === '/auth/login' || pathname === '/auth/logout'
}

/**
 * Mount the auth plugin: register guards and auth routes.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const webServer = ctx.webServer
  const isHttps = webServer.host === '0.0.0.0' && config.publicUrl !== '' ||
    (ctx.get('webServer') as { config?: { tls?: unknown } } | undefined)?.config?.tls !== undefined

  // Validate config: absolute timeout must be >= idle timeout.
  if (config.absoluteTimeoutMs < config.idleTimeoutMs) {
    throw new Error(
      `chaos-auth: absolute timeout (${String(config.absoluteTimeoutMs)}ms) must be >= idle timeout (${String(config.idleTimeoutMs)}ms)`,
    )
  }

  // Only activate guards when the server binds all interfaces (remote access).
  // Loopback keeps the existing anonymous behavior.
  if (webServer.host !== '0.0.0.0') return

  const storeConfig: SessionStoreConfig = {
    idleTimeoutMs: config.idleTimeoutMs,
    absoluteTimeoutMs: config.absoluteTimeoutMs,
  }
  const sessions = new SessionStore(storeConfig)

  // Periodic cleanup (every 10 minutes).
  const cleanupInterval = setInterval(() => { sessions.cleanup() }, 10 * 60 * 1000)
  ctx.effect(() => () => clearInterval(cleanupInterval), 'chaos-auth: cleanup interval')

  // Resolve the token from the credentials system at startup.
  let expectedToken: string | undefined
  ctx.inject(['credentials'], (credCtx) => {
    const ref = credCtx.credentials.resolve({ ref: config.tokenRef })
    if (ref.ok && typeof ref.value === 'string' && ref.value !== '') {
      expectedToken = ref.value
    } else {
      ctx.logger.warn(`chaos-auth: token reference "${config.tokenRef}" is not configured; login will be disabled`)
    }
  })

  // Register auth routes (public, not guarded).
  ctx.effect(() => {
    const disposeLogin = webServer.register({
      kind: 'exact',
      path: '/auth/login',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(loginPageHtml())
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        // Parse form body for the token.
        const body = await readBody(req)
        const params = new URLSearchParams(body)
        const submittedToken = params.get('token') ?? ''

        if (expectedToken === undefined || !constantTimeEqual(submittedToken, expectedToken)) {
          res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
          res.end(loginPageHtml().replace('display:none', 'display:block'))
          return
        }

        // Create session and set cookie.
        const session = sessions.create()
        res.writeHead(302, {
          'set-cookie': buildCookie(session, Date.now(), storeConfig, isHttps),
          location: '/',
        })
        res.end()
      },
    })

    const disposeLogout = webServer.register({
      kind: 'exact',
      path: '/auth/logout',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST' && req.method !== 'GET') {
          res.writeHead(405)
          res.end()
          return
        }
        const sessionId = extractSessionId(req)
        sessions.destroy(sessionId)
        res.writeHead(302, {
          'set-cookie': clearCookie(isHttps),
          location: '/auth/login',
        })
        res.end()
      },
    })

    return () => { disposeLogin(); disposeLogout() }
  }, 'chaos-auth: login/logout routes')

  // Register request guard: checks session before route matching.
  ctx.effect(() => {
    const disposeGuard = webServer.registerGuard(async (req: IncomingMessage, res: ServerResponse) => {
      // Auth endpoints are public.
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (isAuthEndpoint(pathname)) return true

      // Check session.
      const sessionId = extractSessionId(req)
      const session = sessions.validate(sessionId)
      if (session !== undefined) return true

      // Unauthenticated: page requests get the login page, API requests get 401.
      if (isPageRequest(req)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(loginPageHtml())
      } else {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
      }
      return false
    })
    return () => disposeGuard()
  }, 'chaos-auth: request guard')

  // Register upgrade guard: checks session before WebSocket upgrade.
  ctx.effect(() => {
    const disposeUpgradeGuard = webServer.registerUpgradeGuard((req: IncomingMessage, socket: Duplex) => {
      const sessionId = extractSessionId(req)
      const session = sessions.validate(sessionId)
      if (session !== undefined) return true
      // Unauthenticated upgrade: reject.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return false
    })
    return () => disposeUpgradeGuard()
  }, 'chaos-auth: upgrade guard')
}

/** Read the request body as a string. */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
    if (chunks.reduce((sum, c) => sum + c.length, 0) > 1_000_000) {
      throw new Error('request body too large')
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}
