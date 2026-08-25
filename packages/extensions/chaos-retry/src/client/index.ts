/**
 * Turn-retry surface plugin, browser half. Two contributions:
 *
 * 1. the `turn-interrupted` Chat node, which gives the persistence layer's
 *    crash-recovery closure a durable transcript row (the shipped node set has
 *    no Definition for that reason, so a turn killed before its first token
 *    otherwise projects to nothing); and
 * 2. the RetryDock entry in the `conversation.input.dock` strip.
 *
 * Presentation-only — the abnormal-end state derives from the session snapshot
 * each render and the resend rides the standard inputActions, so this plugin
 * owns no store, no refresh chain, and no event listener.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { RetryDock } from './RetryDock.tsx'
import { TurnInterruptedNodeView } from './TurnInterruptedNodeView.tsx'
import { turnInterruptedDefinition } from './turn-interrupted.ts'
import { en, zh } from './locales.ts'

export { RetryDock, RetryStrip } from './RetryDock.tsx'
export { TurnInterruptedNodeView } from './TurnInterruptedNodeView.tsx'
export { turnInterruptedDefinition } from './turn-interrupted.ts'
export type { TurnInterruptedData } from './turn-interrupted.ts'
export { detectAbnormalEnd, lastUserTextOf } from './retry-model.ts'
export type { AbnormalEnd } from './retry-model.ts'
export type { RetryKey } from './locales.ts'

/** Dictionary namespace owned by this plugin (merge lives in locales.ts). */
const NS = 'chaos-retry'

/** Required services for the node contribution, the dock entry, and the copy. */
export const inject = ['slots', 'locale', 'conversationEvents']

/**
 * Client plugin body: contribute the crash-recovery node and the retry dock.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chaos-retry: dictionaries')
  ctx.effect(
    () => ctx.conversationEvents.register(turnInterruptedDefinition),
    'chaos-retry: crash-recovery turn node',
  )

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'turn-interrupted',
    locale: NS,
  }, TurnInterruptedNodeView))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'chaos-retry',
    order: 20,
    locale: NS,
  }, RetryDock))
}
