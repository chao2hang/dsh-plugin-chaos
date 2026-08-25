/** Browser entry that replaces only the assistant-step renderer. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ThinkTagAssistantNodeView } from './ThinkTagAssistantNodeView.tsx'

export { ThinkTagAssistantNodeView } from './ThinkTagAssistantNodeView.tsx'
export { normalizeThinkTags } from './think-tags.ts'

/** Required browser services for the keyed conversation renderer. */
export const inject = ['slots']

/** Register the assistant renderer that recognizes think-tag output. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'assistant-step',
    priority: -1,
    locale: 'conversation',
  }, ThinkTagAssistantNodeView))
}
