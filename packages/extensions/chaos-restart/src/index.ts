/**
 * @deepseek-ai/dsh-plugin-chaos-restart — Server self-restart plugin.
 * Registers a `/api/system/restart` RPC route on the webserver and provides
 * status info. The restart uses the ProcessControl service: spawn a successor
 * process with the same command line, then stop this process. The client
 * treats the disconnect as a normal reconnection.
 *
 * Security: the restart endpoint requires an authenticated session (the auth
 * plugin's request guard protects it when remote access is enabled). On
 * loopback, the endpoint is accessible as before.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-restart
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-process-control'

/** Stable Cordis plugin name. */
export const name = 'chaos-restart'

/** Required services: the web server and the process-control service. */
export const inject = ['webServer']

/** Plugin configuration. */
export interface Config {
  /** Whether to enable the restart control (default: true when ProcessControl is available). */
  enabled: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

/**
 * Mount the restart plugin: register the /api/system/status and
 * /api/system/restart routes.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  const webServer = ctx.webServer

  ctx.effect(() => {
    const disposeStatus = webServer.register({
      kind: 'exact',
      path: '/api/system/status',
      handler: (_req: IncomingMessage, res: ServerResponse) => {
        const processControl = ctx.get('processControl')
        const canRestart = processControl?.canRestart ?? false
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ canRestart }))
      },
    })

    const disposeRestart = webServer.register({
      kind: 'exact',
      path: '/api/system/restart',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        const processControl = ctx.get('processControl')
        if (processControl === undefined || !processControl.canRestart) {
          res.writeHead(503, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, reason: 'restart not supported' }))
          return
        }
        let result: { ok: true } | { ok: false; reason: string }
        try {
          result = await processControl.restart()
        } catch (error) {
          result = {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          }
        }
        if (!result.ok) {
          res.writeHead(503, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(result))
      },
    })

    return () => { disposeStatus(); disposeRestart() }
  }, 'chaos-restart: system routes')
}
