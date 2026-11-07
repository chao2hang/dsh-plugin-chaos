/** Browser entry that replaces only the assistant-step renderer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the renderer's Context merge (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the `chatFileMentions` Context service merge into this program.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { ThinkTagAssistantNodeView } from './ThinkTagAssistantNodeView.tsx'

export { ThinkTagAssistantNodeView } from './ThinkTagAssistantNodeView.tsx'
export { normalizeThinkTags } from './think-tags.ts'

/** Required browser services for the keyed conversation renderer. */
export const inject = ['slots']

/** Register the assistant renderer that recognizes think-tag output. */
export function apply(ctx: ClientContext): void {
  // No `children`: the node view renders image blocks through the shared
  // gallery Content Factory. Declaring `conversation.chat.message.images` here
  // would collide with upstream's assistant-step entry — child declarations
  // are global — and abort this registration.
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'assistant-step',
    priority: -1,
    locale: 'chat',
    // [rc.1 PATCH] `fileMentions` left ChatNodeViewProps for the entry's own
    // `inject`; this registration supplies the resolver itself.
    inject: sessionId => ({
      fileMentions: owner => ctx.get('chatFileMentions')?.forClosing(owner, sessionId),
    }),
  }, ThinkTagAssistantNodeView))
}
