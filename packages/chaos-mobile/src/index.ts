/**
 * Mobile adaptation plugin, node half: registers workspace file preview HTTP route
 * on webServer, while the browser half ships through `exports["./client"]`.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-mobile
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { handleFilePreview } from './file-preview-route.ts'

/** Stable Cordis plugin name. */
export const name = 'chaos-mobile'

/**
 * Required service: the web server carrying the preview route. Declaring it
 * guarantees the webserver service exists before `apply` runs — an undeclared
 * `ctx.get` at apply time races the composition order and silently skips the
 * registration.
 */
export const inject = ['webServer']

/** Host plugin body — registers the file preview endpoint on the web server. */
export function apply(ctx: Context): void {
  const webServer = ctx.webServer
  ctx.effect(() => {
    return webServer.register({
      kind: 'exact',
      path: '/api/chaos/file',
      handler: handleFilePreview,
    })
  }, 'chaos-mobile: file-preview route')
}
