/**
 * Mobile adaptation plugin, browser half: provides mobile-specific UI
 * through the shell.overlay slot (hamburger button, drawer sidebar,
 * backdrop, details close button) and injects global CSS that adapts
 * the existing AppFrame for narrow viewports (< 768px).
 *
 * Does NOT replace the root slot component - that would re-declare the
 * four child slots that ui-layout already declares, which the slot
 * registry forbids. Instead, chaos-mobile adds to the shell.overlay
 * list slot and uses CSS transforms to make the existing layout work
 * on mobile.
 *
 * Panel state coordination: the overlay calls ctx.layout actions
 * (toggleSidebar, closeDetails) to open/close panels. The AppFrame
 * existing layout store handles state changes; CSS in mobile.css
 * repositions the sidebar and details as fixed overlays below the
 * mobile breakpoint.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MobileOverlay, type MobileOverlayInjected } from './MobileOverlay.tsx'
import { AttachmentButton } from './AttachmentButton.tsx'
import mobileCss from '../styles/mobile.css?inline'

/** Stable Cordis plugin name. */
const PLUGIN_ID = '@deepseek-ai/dsh-plugin-chaos-mobile'

/** Required services: slots, conversation, layout actions, and the workspace session starter. */
export const inject = ['slots', 'conversation', 'layout', 'uiWorkspace', 'sessions']

/** Workspace UI navigation slice this plugin uses (New Session button). */
interface WorkspaceNavigation {
  startSession(): void
}

/**
 * Mount the mobile adaptation: inject global CSS and register mobile controls.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as unknown as WorkspaceNavigation
  // Inject global mobile CSS for the plugin lifetime.
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = PLUGIN_ID + '/mobile.css'
    tag.textContent = mobileCss
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'chaos-mobile: global CSS')

  // Register into the additive overlay slot once ui-layout declares it.
  // SlotRegistry.inject() is the public declaration-lifecycle API: it waits
  // for the parent frame registration, re-registers after a replacement, and
  // disposes this entry with the plugin.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'chaos-mobile',
    priority: -1,
    inject: (): MobileOverlayInjected => ({
      toggleSidebar: () => { ctx.layout.toggleSidebar() },
      openDetails: () => { ctx.layout.openDetails() },
      closeDetails: () => { ctx.layout.closeDetails() },
      newSession: () => { workspaceNavigation.startSession() },
    }),
  }, MobileOverlay))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'chaos-mobile-attachment-picker',
    inject: sessionId => ({
      // The unified attachment intake lives on the concrete controller face,
      // as the composer's own addFiles callback reads it. The button hands a
      // string id; the slot's branded sessionId resolves the scope instead.
      conversation: {
        createDrafts: (_id, files) => (ctx.conversation as ConversationController).createDrafts(sessionId, files),
        releaseDraftAttachments: (drafts) => { (ctx.conversation as ConversationController).releaseDraftAttachments(drafts) },
        addAttachments: (_id, draftIds) => {
          const actx = ctx.sessions.scope(sessionId)
          return actx === undefined ? false : ctx.conversation.input.for(actx).addAttachments(draftIds as never)
        },
        notify: (_id, level, text) => {
          const actx = ctx.sessions.scope(sessionId)
          if (actx !== undefined) ctx.conversation.input.for(actx).notify(level, text)
        },
      },
    }),
  }, AttachmentButton))
}
