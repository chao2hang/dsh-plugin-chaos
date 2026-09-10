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

/** Host plugin body — registers file preview endpoint on the web server if present. */
export function apply(ctx: Context): void {
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => {
      return webServer.register({
        kind: 'exact',
        path: '/api/chaos/file',
        handler: handleFilePreview,
      })
    }, 'chaos-mobile: file-preview route')
  }
}
