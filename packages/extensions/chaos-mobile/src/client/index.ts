/**
 * Mobile adaptation plugin, browser half: shadows the built-in 'root' slot
 * with ChaosAppFrame (priority: -1, so it renders instead of ui-layout's
 * AppFrame), and injects the global mobile CSS stylesheet. The shadow
 * preserves all four child slots (sidebar, conversation, details,
 * shell.overlay); the inject hook connects the store's panel actions to
 * ctx.layout so other plugins' panel gestures work unchanged.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: LayoutController is the concrete class behind ctx.layout; we
// need its attachPanels method (public on the class, absent from the
// ILayout interface). Type-only import is erased — no runtime coupling.
import type { LayoutController } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { ChaosAppFrame } from './ChaosAppFrame.tsx'
import { createCombinedLayoutStore } from './combined-store.ts'
import mobileCss from '../styles/mobile.css?inline'

/** Stable Cordis plugin name. */
const PLUGIN_ID = '@deepseek-ai/dsh-plugin-chaos-mobile'

/** Required services: the UI slot registry. */
export const inject = ['slots']

/**
 * Mount the mobile-aware frame: shadow the 'root' slot, inject global CSS,
 * and wire the panel actions to ctx.layout.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  // Inject global mobile CSS for the plugin lifetime.
  ctx.effect(() => {
    if (typeof document === 'undefined') return
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/mobile.css`
    tag.textContent = mobileCss
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'chaos-mobile: global CSS')

  // Shadow the 'root' slot: register with priority: -1 so our entry renders
  // instead of ui-layout's shipped AppFrame (default priority: 0).
  ctx.slots.inject('root', () =>
    ctx.slots.register({
      name: 'root',
      priority: -1,
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      store: createCombinedLayoutStore,
      inject: (actions: BoundActions<ReturnType<typeof createCombinedLayoutStore>>) => {
        // Connect panel actions to ctx.layout so toggleSidebar, openDetails,
        // and closeDetails work as other plugins expect. LayoutController is
        // the concrete class behind ctx.layout; its attachPanels method is
        // public but not on the ILayout interface.
        const controller = ctx.get('layout') as LayoutController | undefined
        controller?.attachPanels(actions)
        return {}
      },
    }, ChaosAppFrame),
  )
}
