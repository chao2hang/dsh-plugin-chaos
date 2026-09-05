/**
 * @deepseek-ai/dsh-host-webserver — node:http route registration with optional
 * gzip, optional TLS, index injection, and one fallback seat. It knows no
 * harness concepts and serves no files; the composing application owns dist
 * serving. Electron uses file:// plus IPC instead, and this package never
 * prints the URL. Route handlers retain direct response ownership.
 */

import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import compressionMiddleware from 'compression'
import Negotiator from 'negotiator'
import { renderIndexInjections, type IndexInjection } from './injections.ts'

export { renderIndexInjections } from './injections.ts'
export type { IndexInjection, IndexInjectionPlacement } from './injections.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServer
  }
  interface Events {
    /**
     * Collect the structured index injection table. Emitted on every index
     * render and every worker boot-payload request; listeners push their
     * current rows, so a row's data is read fresh at emit time.
     * @param table - Mutable row table; listeners append in activation order.
     * @mode emit
     */
    'webserver/index-inject'(table: IndexInjection[]): void
  }
}

/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
export type WebRouteKind = 'exact' | 'prefix'

/** One named route registration. */
export interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** One exact-path HTTP upgrade registration. */
export interface WebUpgradeRoute {
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns protocol negotiation and the upgraded socket after dispatch. */
  handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

/** TLS certificate and private key for self-run HTTPS (paths on the host); empty values disable TLS. */
export interface TlsConfig {
  /** PEM certificate file path on the host. */
  cert: string
  /** PEM private key file path on the host. */
  key: string
}

/** Web server listen, response-compression, and optional TLS config. */
export interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
  /** Response compression for socket-backed HTTP requests. @default 'none' */
  compression?: 'none' | 'gzip'
  /** Gzip DEFLATE level from 0 through 9. @default 1 */
  compressionLevel?: number
  /** Minimum known response length eligible for gzip; unknown-length streams are eligible. @default 1024 */
  compressionThresholdBytes?: number
  /** TLS certificate and private key for self-run HTTPS (paths on the host); empty values disable TLS. */
  tls: TlsConfig
}

const DEFAULT_COMPRESSION = 'none' as const
const DEFAULT_COMPRESSION_LEVEL = 1
const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024

interface ResolvedConfig extends Config {
  compression: 'none' | 'gzip'
  compressionLevel: number
  compressionThresholdBytes: number
}

type NodeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void

function createGzipMiddleware(config: ResolvedConfig): NodeMiddleware {
  // `compression` is typed for Express, but its runtime uses only the
  // node:http request and response members supplied here.
  const middleware = compressionMiddleware({
    level: config.compressionLevel,
    threshold: config.compressionThresholdBytes,
    filter(request, response) {
      if (response.getHeader('content-range') !== undefined) return false
      const contentType = response.getHeader('content-type')
      if (typeof contentType === 'string' && contentType.toLowerCase().startsWith('text/event-stream')) return false
      return compressionMiddleware.filter(request, response)
    },
  }) as unknown as NodeMiddleware

  return (req, res, next) => {
    // The Web Worker tunnel has no socket and transfers identity bytes.
    if ((res as { socket?: unknown }).socket === undefined) {
      next()
      return
    }
    const encoding = new Negotiator(req).encoding(['gzip', 'identity'])
    const gzipRequest = Object.create(req) as IncomingMessage
    Object.defineProperty(gzipRequest, 'headers', {
      value: { ...req.headers, 'accept-encoding': encoding === 'gzip' ? 'gzip' : 'identity' },
    })
    middleware(gzipRequest, res, next)
  }
}

/**
 * Request guard: runs before route matching on every HTTP request. Return
 * `true` to continue to route matching; return `false` to stop (the guard
 * is expected to have written the response, e.g. a login redirect). Guards
 * run in registration order; the first `false` stops the chain.
 */
export type RequestGuard = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>

/**
 * Upgrade guard: runs before upgrade route matching on every WebSocket
 * upgrade request. Same contract as {@link RequestGuard}: `true` continues,
 * `false` stops (the guard owns the socket). Guards run in registration order.
 */
export type UpgradeGuard = (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean | Promise<boolean>

/**
 * The browser HTTP carrier service. Activation listens immediately. Route
 * registration order does not affect requests because configured named routes
 * must be distinct, and the fallback handler answers anything not yet claimed
 * during startup with 404 until its owner registers. A listen failure rejects
 * initialization, and the boot process reports the failed fiber.
 */
export class WebServer extends Service {
  static Config: z<Config> = z.object({
    host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
    port: z.natural().max(65535).required(),
    compression: z.union([z.const('none'), z.const('gzip')]).default(DEFAULT_COMPRESSION),
    compressionLevel: z.number().step(1).min(0).max(9).default(DEFAULT_COMPRESSION_LEVEL),
    compressionThresholdBytes: z.natural().default(DEFAULT_COMPRESSION_THRESHOLD_BYTES),
    tls: z.object({
      cert: z.string().default(''),
      key: z.string().default(''),
    }).default({ cert: '', key: '' }),
  })

  private readonly exact = new Map<string, WebRoute>()
  private readonly prefixes = new Map<string, WebRoute>()
  private readonly upgrades = new Map<string, WebUpgradeRoute>()
  private readonly upgradedSockets = new Set<Duplex>()
  private readonly indexTaps: ((html: string) => string)[] = []
  private readonly requestGuards: RequestGuard[] = []
  private readonly upgradeGuards: UpgradeGuard[] = []
  private readonly authenticatedRequests = new WeakSet<IncomingMessage>()
  private fallback: WebRoute['handler'] | undefined
  private server!: Server
  private listenedPort!: number
  private readonly gzip: NodeMiddleware | undefined

  constructor(ctx: Context, private config: Config) {
    super(ctx, 'webServer')
    const resolved = config as ResolvedConfig
    this.gzip = resolved.compression === 'gzip' ? createGzipMiddleware(resolved) : undefined
  }

  /** The listening port (the OS-assigned value when config.port is 0). */
  get port(): number {
    return this.listenedPort
  }

  /** The configured bind host (the loopback or all-interfaces literal). */
  get host(): Config['host'] {
    return this.config.host
  }

  /**
   * Mark a request that a preceding authentication guard has validated.
   * The marker is request-local and never derived from a client-controlled header.
   * @param req - validated HTTP or upgrade request.
   */
  markAuthenticated(req: IncomingMessage): void {
    this.authenticatedRequests.add(req)
  }

  /**
   * Whether a preceding authentication guard validated this request.
   * @param req - HTTP or upgrade request being dispatched.
   * @returns true only for a request marked by this server instance.
   */
  isAuthenticated(req: IncomingMessage): boolean {
    return this.authenticatedRequests.has(req)
  }

  /**
   * Register a named route. Duplicate (kind, path) throws — route patterns are
   * a composition-level contract, so a collision is a misconfiguration.
   * @param route - kind, path, and the owning handler.
   * @returns the disposer removing the route.
   */
  register(route: WebRoute): () => void {
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(route.path)) {
      throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    }
    table.set(route.path, route)
    return () => { table.delete(route.path) }
  }

  /**
   * Register an exact-path HTTP upgrade route. Duplicate paths throw because
   * one socket can have only one protocol owner.
   * @param route - pathname and handler owning negotiation plus socket use.
   * @returns the disposer removing the route.
   */
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  /**
   * Register a request guard: runs before route matching on every HTTP
   * request. Guards run in registration order; the first `false` result
   * stops the chain (the guard owns the response). This is the generic
   * extension point for request interception — authentication, rate limiting,
   * logging — anything that must run before route dispatch.
   * @param guard - the guard function.
   * @returns the disposer removing the guard.
   */
  registerGuard(guard: RequestGuard): () => void {
    this.requestGuards.push(guard)
    return () => {
      const at = this.requestGuards.indexOf(guard)
      if (at !== -1) this.requestGuards.splice(at, 1)
    }
  }

  /**
   * Register an upgrade guard: runs before upgrade route matching on every
   * WebSocket upgrade. Same chain semantics as {@link registerGuard}.
   * @param guard - the upgrade guard function.
   * @returns the disposer removing the guard.
   */
  registerUpgradeGuard(guard: UpgradeGuard): () => void {
    this.upgradeGuards.push(guard)
    return () => {
      const at = this.upgradeGuards.indexOf(guard)
      if (at !== -1) this.upgradeGuards.splice(at, 1)
    }
  }

  /**
   * Claim the fallback seat: the handler answering every request no named
   * route matches (the SPA dist server in the shipped Web composition). One
   * owner only — a second registration throws, because two fallbacks cannot
   * compose.
   * @param handler - owns the full response lifecycle of unmatched requests.
   * @returns the disposer releasing the seat.
   */
  registerFallback(handler: WebRoute['handler']): () => void {
    if (this.fallback !== undefined) {
      throw new Error('webserver: fallback already registered')
    }
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  /**
   * Register a raw-HTML index transform, the escape hatch for markup no
   * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
   * registration order after rendering the structured rows.
   * @param transform - pure html-to-html function.
   * @returns the disposer removing the transform.
   */
  tapIndex(transform: (html: string) => string): () => void {
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  /** Listen; resolves once the socket is bound (rejection = FAILED fiber). */
  async [Service.init](): Promise<void> {
    const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      // Request guards run before route matching. A guard returning false
      // is expected to have written the response (e.g. a 401 or login
      // redirect); the chain stops and no route handler runs.
      for (const guard of this.requestGuards) {
        const ok = await guard(req, res)
        if (!ok) return
      }
      /* v8 ignore next -- `?? '/'` arm: node:http always sets url on server
      requests; the field is only optional on the client-side IncomingMessage type */
      const rawPath = new URL(req.url ?? '/', 'http://x').pathname
      const route = this.match(rawPath)
      if (route !== undefined) {
        await route.handler(req, res)
        return
      }
      const fallback = this.fallback
      if (fallback === undefined) {
        res.writeHead(404)
        res.end()
        return
      }
      await fallback(req, res)
    }
    // Last-resort guard: handle() rejecting would otherwise be an unhandled
    // rejection killing the process on one malformed request (bad %-escape,
    // client dropping mid-body). Per-request failures log and answer 400 —
    // never a process exit.
    // TLS: when cert and key paths are configured, create an HTTPS server
    // instead of plain HTTP. The request handler and upgrade logic are
    // identical — only the transport differs.
    const requestHandler = (req: IncomingMessage, res: ServerResponse): void => {
      const next = (): void => {
        void handle(req, res).catch((err: unknown) => {
          this.ctx.logger.warn(err instanceof Error ? err : new Error(String(err)))
          if (res.headersSent) {
            res.destroy()
            return
          }
          res.writeHead(400)
          res.end()
        })
      }
      if (this.gzip === undefined) next()
      else this.gzip(req, res, next)
    }
    if (this.config.tls.cert !== '' && this.config.tls.key !== '') {
      this.server = createHttpsServer({
        cert: readFileSync(this.config.tls.cert),
        key: readFileSync(this.config.tls.key),
      }, requestHandler)
    } else {
      this.server = createServer(requestHandler)
    }
    this.server.on('upgrade', (req, socket, head) => {
      const onError = (error: Error): void => {
        this.ctx.logger.warn(error)
        socket.destroy()
      }
      socket.on('error', onError)
      socket.once('close', () => {
        socket.off('error', onError)
        this.upgradedSockets.delete(socket)
      })
      // Upgrade guards run before route matching, same chain semantics as
      // request guards. A guard returning false is expected to have
      // handled the socket (e.g. by destroying it or sending a 401).
      const runUpgradeGuards = async (): Promise<boolean> => {
        for (const guard of this.upgradeGuards) {
          const ok = await guard(req, socket, head)
          if (!ok) return false
        }
        return true
      }
      Promise.resolve(runUpgradeGuards()).then((guarded) => {
        if (!guarded) return
        this.handleUpgradeRoute(req, socket, head)
      }).catch((error: unknown) => {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off('error', reject)
        this.server.on('error', (err) => { this.ctx.logger.error(err) })
        this.listenedPort = (this.server.address() as AddressInfo).port
        resolve()
      })
    })

    // Node does not include upgraded sockets in closeAllConnections(). The service
    // owns them with the other connections, so it tracks and destroys them explicitly.
    this.ctx.effect(() => async () => {
      const serverClosed = new Promise<void>((resolve) => {
        this.server.close(() => { resolve() })
      })
      this.server.closeAllConnections()
      const upgradedClosed = [...this.upgradedSockets].map(socket => new Promise<void>((resolve) => {
        socket.once('close', () => { resolve() })
        socket.destroy()
      }))
      await Promise.all([serverClosed, ...upgradedClosed])
    }, 'webServer.listen')
  }

  /**
   * Match and dispatch one upgrade route after guards have passed. Extracted
   * from the upgrade event handler so guard logic stays separate from route
   * matching. A missing route destroys the socket.
   * @param req - the upgrade request.
   * @param socket - the duplex socket.
   * @param head - the first packet of the upgraded data.
   */
  private async handleUpgradeRoute(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    let route: WebUpgradeRoute | undefined
    try {
      /* v8 ignore next -- node:http always sets url on server requests. */
      route = this.upgrades.get(new URL(req.url ?? '/', 'http://x').pathname)
    } catch (error) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      socket.destroy()
      return
    }
    if (route === undefined) {
      socket.destroy()
      return
    }
    this.upgradedSockets.add(socket)
    try {
      Promise.resolve(route.handler(req, socket, head)).catch((error: unknown) => {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        socket.destroy()
      })
    } catch (error) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      socket.destroy()
    }
  }

  /** Longest-prefix-wins over the prefix table after an exact-table miss. */
  private match(pathname: string): WebRoute | undefined {
    const exact = this.exact.get(pathname)
    if (exact !== undefined) return exact
    let best: WebRoute | undefined
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
      if (best === undefined || prefix.length > best.path.length) best = route
    }
    return best
  }

  /**
   * Run an index.html body through the registered taps in registration order
   * — called by the fallback owner on every index response it renders.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  applyIndexTaps(html: string): string {
    let out = html
    for (const transform of this.indexTaps) out = transform(out)
    return out
  }

  /**
   * Gather the structured injection table: one `webserver/index-inject` emit,
   * every subscriber pushes its current rows. Fresh per call, so subscribers
   * read live state (module graph, theme preference) at emit time.
   * @returns rows in subscriber activation order.
   */
  collectIndexInjections(): IndexInjection[] {
    const table: IndexInjection[] = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  /**
   * Render one index.html body: the structured injection table first, then
   * the raw `tapIndex` transforms over the result.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  renderIndex(html: string): string {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }
}

export default WebServer
