/**
 * @deepseek-ai/dsh-plugin-chaos-auth — Remote access authentication plugin.
 * It requires the dsh-host-webserver `registerGuard` and
 * `registerUpgradeGuard` APIs. Unauthenticated requests receive a minimal
 * login page (for page requests) or 401 (for API requests); authenticated
 * requests pass through with refreshed session activity. Login/logout endpoints
 * are public named routes.
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
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  SessionStore, constantTimeEqual, extractSessionId, buildCookie, clearCookie,
  DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_ABSOLUTE_TIMEOUT_MS,
  type SessionStoreConfig,
} from './session-store.ts'

/** Stable Cordis plugin name. */
export const name = 'chaos-auth'

/** Required services: the web server and built-in browser-session authority. */
export const inject = ['webServer', 'connection']

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

/** Login page HTML: standalone, responsive, and intentionally app-code free. */
function loginPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>登录 · DeepSeek Harness</title>
<style>
:root{color-scheme:dark;--bg:#171410;--surface:#201c16;--border:rgba(237,230,214,.14);--text:#ece5d3;--muted:#9d937e;--accent:#b3402f;--accent-pressed:#93331f}
*{box-sizing:border-box}
html{min-height:100%;background:var(--bg)}
body{min-height:100dvh;margin:0;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));background:radial-gradient(120% 60% at 50% 0%,rgba(236,229,211,.045) 0,transparent 60%),var(--bg);color:var(--text);font-family:"Songti SC","STSong","Noto Serif SC","Source Han Serif SC",serif;-webkit-font-smoothing:antialiased}
.brand{display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:36px}
.seal{display:grid;place-items:center;width:44px;height:44px;border-radius:6px;background:var(--accent);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),inset 0 -3px 6px rgba(0,0,0,.28);color:#f4ead8;font-size:24px;font-weight:700;line-height:1}
.wordmark{color:var(--muted);font-family:ui-sans-serif,-apple-system,"Helvetica Neue",sans-serif;font-size:11px;font-weight:600;letter-spacing:.42em;text-indent:.42em}
h1{margin:0 0 10px;font-size:30px;font-weight:600;line-height:1.25;letter-spacing:.12em;text-align:center}
.sub{margin:0 0 30px;color:var(--muted);font-size:14px;line-height:1.7;text-align:center}
label{display:block;margin-bottom:10px;color:var(--text);font-size:14px;font-weight:600;letter-spacing:.18em}
input{width:100%;height:52px;padding:0 16px;border:1px solid var(--border);border-radius:8px;outline:0;background:var(--surface);color:var(--text);font:inherit;font-size:16px;letter-spacing:.06em;transition:border-color .18s ease,box-shadow .18s ease}
input::placeholder{color:#6f675a}
input:hover{border-color:rgba(237,230,214,.26)}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(179,64,47,.18)}
button{width:100%;min-height:52px;margin-top:18px;border:0;border-radius:8px;background:var(--accent);color:#f4ead8;font:inherit;font-size:16px;font-weight:600;letter-spacing:.5em;text-indent:.5em;cursor:pointer;transition:background .18s ease,transform .18s ease}
button:hover{background:#c34a37}
button:active{background:var(--accent-pressed);transform:translateY(1px)}
button:focus-visible{outline:3px solid rgba(179,64,47,.4);outline-offset:2px}
.error{display:none;margin:14px 0 0;padding:11px 14px;border:1px solid rgba(179,64,47,.4);border-radius:8px;background:rgba(179,64,47,.12);color:#e8a195;font-size:13px;line-height:1.5;letter-spacing:.06em}
.footer{margin:30px 0 0;color:#6f675a;font-size:12px;line-height:1.6;letter-spacing:.14em;text-align:center}
.side{position:fixed;top:50%;right:max(14px,env(safe-area-inset-right));transform:translateY(-50%);writing-mode:vertical-rl;color:rgba(237,230,214,.16);font-size:15px;letter-spacing:.6em;pointer-events:none;user-select:none}
.login{display:flex;flex-direction:column;justify-content:center;width:min(100%,400px);min-height:calc(100dvh - max(48px,env(safe-area-inset-top) + env(safe-area-inset-bottom)));margin:auto}
@media (max-width:480px){body{display:block;padding:20px max(24px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}h1{font-size:27px}.login{width:100%;min-height:calc(100dvh - max(40px,env(safe-area-inset-top) + env(safe-area-inset-bottom)))}.side{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="side" aria-hidden="true">凭钥而入</div>
<main class="login" aria-labelledby="login-title">
  <div class="brand"><span class="seal" aria-hidden="true">启</span><span class="wordmark">DEEPSEEK HARNESS</span></div>
  <h1 id="login-title">欢迎回来</h1>
  <p class="sub">此实例已启用访问保护，请输入通行密钥以继续。</p>
  <form method="POST" action="/auth/login">
    <label for="token">通行密钥</label>
    <input id="token" type="password" name="token" placeholder="请输入通行密钥" autocomplete="current-password" autofocus required>
    <button type="submit">进入</button>
    <div class="error" id="err" role="alert">密钥不正确，请核对后重试。</div>
  </form>
  <p class="footer">此连接已受保护 · 仅受邀用户可访问</p>
</main>
</body>
</html>`
}
/** Whether a request is a page request (accepts HTML) vs an API request. */
function isPageRequest(req: IncomingMessage): boolean {
  const accept = req.headers.accept ?? ''
  return accept.includes('text/html')
}

/** Whether an unauthenticated request may read this public endpoint or install metadata. */
function isPublicUnauthenticatedPath(pathname: string, search = ''): boolean {
  return pathname === '/auth/login' || pathname === '/auth/logout' || pathname === '/manifest.webmanifest' ||
    (pathname === '/' && new URLSearchParams(search).has('token'))
}

/**
 * Mount the auth plugin: register guards and auth routes.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const webServer = ctx.webServer
  const connection = ctx.get('connection') as { authenticatedUrl: (baseUrl: string) => string }
  const tls = (ctx.get('webServer') as { config?: { tls?: { cert?: unknown; key?: unknown } } } | undefined)?.config?.tls
  const isHttps = config.publicUrl.startsWith('https://') ||
    (typeof tls?.cert === 'string' && tls.cert !== '' && typeof tls.key === 'string' && tls.key !== '')

  // Validate config: absolute timeout must be >= idle timeout.
  if (config.absoluteTimeoutMs < config.idleTimeoutMs) {
    throw new Error(
      `chaos-auth: absolute timeout (${String(config.absoluteTimeoutMs)}ms) must be >= idle timeout (${String(config.idleTimeoutMs)}ms)`,
    )
  }

  // Loopback remains anonymous unless a reverse proxy explicitly supplies the public URL.
  if (webServer.host !== '0.0.0.0' && config.publicUrl === '') return
  // dsh-host-webserver exposes these hooks as the supported cross-cutting
  // interception seam. Fail at activation when an older host is used.
  if (typeof webServer.registerGuard !== 'function' || typeof webServer.registerUpgradeGuard !== 'function') {
    throw new Error('chaos-auth requires dsh-host-webserver registerGuard/registerUpgradeGuard')
  }

  const storeConfig: SessionStoreConfig = {
    idleTimeoutMs: config.idleTimeoutMs,
    absoluteTimeoutMs: config.absoluteTimeoutMs,
  }
  const sessions = new SessionStore(storeConfig)

  // Periodic cleanup (every 10 minutes).
  const cleanupInterval = setInterval(() => { sessions.cleanup() }, 10 * 60 * 1000)
  ctx.effect(() => () =>{  clearInterval(cleanupInterval) }, 'chaos-auth: cleanup interval')

  // Resolve the token from the credentials system at startup.
  let expectedToken: string | undefined
  ctx.inject(['credentials'], (credCtx) => {
    void credCtx.credentials.resolve(credentialRef(config.tokenRef)).then((resolved) => {
      if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value !== '') {
        expectedToken = resolved.value
      } else {
        credCtx.logger.warn(`chaos-auth: token reference "${config.tokenRef}" is not configured; login will be disabled`)
      }
    })
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
          location: connection.authenticatedUrl(config.publicUrl || `http://${req.headers.host ?? '127.0.0.1'}`),
        })
        res.end()
      },
    })

    const disposeLogout = webServer.register({
      kind: 'exact',
      path: '/auth/logout',
      handler: (req: IncomingMessage, res: ServerResponse) => {
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
    const disposeGuard = webServer.registerGuard((req: IncomingMessage, res: ServerResponse) => {
      // Auth endpoints and the install manifest are public.
      const requestUrl = new URL(req.url ?? '/', 'http://x')
      if (isPublicUnauthenticatedPath(requestUrl.pathname, requestUrl.search)) return true

      // Check session.
      const sessionId = extractSessionId(req)
      const session = sessions.validate(sessionId)
      if (session !== undefined) {
        return true
      }

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
    return () =>{  disposeGuard() }
  }, 'chaos-auth: request guard')

  // Register upgrade guard: checks session before WebSocket upgrade.
  ctx.effect(() => {
    const disposeUpgradeGuard = webServer.registerUpgradeGuard((req: IncomingMessage, socket: Duplex) => {
      const sessionId = extractSessionId(req)
      const session = sessions.validate(sessionId)
      if (session !== undefined) {
        return true
      }
      // Unauthenticated upgrade: reject.
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return false
    })
    return () =>{  disposeUpgradeGuard() }
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
