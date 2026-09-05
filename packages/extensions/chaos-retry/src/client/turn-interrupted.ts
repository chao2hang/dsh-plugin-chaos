/**
 * The `turn-interrupted` Chat node: the missing UI half of the persistence
 * layer's crash recovery.
 *
 * A turn whose process died leaves no `turn/end` of its own; the persistence
 * backend closes it on reload with `reason.kind === 'interrupted'` (a marker
 * the agent loop never emits). The shipped node set has a Definition for every
 * other terminal reason but not for this one, and the interrupted-assistant
 * fallback in ui-conversation requires streamed content evidence — so a turn
 * killed before its first token, or between a tool call and its result,
 * projects to nothing at all. This Definition makes that ending durable in the
 * transcript regardless of how far the turn got.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationMatch, ConversationNodeContext, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'

/** Terminal notice for a turn a process death cut short. */
export interface TurnInterruptedData {
  /** Turn number the recovery closed. */
  readonly turn: number
  /** Seq of the recovery-written `turn/end`. */
  readonly seq: number
  /** Unix epoch ms of that event. */
  readonly time: number
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Turn closed by crash recovery rather than by the loop. */
    'turn-interrupted': TurnInterruptedData
  }
}

function stateFrom(match: ConversationMatch): TurnInterruptedData | undefined {
  if (match.event.type !== 'turn/end' || match.event.data.reason.kind !== 'interrupted') return undefined
  return { turn: match.event.data.turn, seq: match.event.seq, time: match.event.time }
}

/**
 * Crash-recovery turn closure Definition. Matches only the persistence-written
 * marker, so an ordinary abort (`aborted`) and a provider failure (`error`)
 * keep their own rows.
 */
export const turnInterruptedDefinition: ConversationNodeDefinition<TurnInterruptedData> = {
  kind: 'turn-interrupted',
  target: 'chat',
  match: (event) => {
    if (event.type === 'turn/end' && event.data.reason.kind === 'interrupted') {
      return { id: String(event.data.turn), role: 'start' }
    }
    return null
  },
  start: (_context, match, _reader) => {
    const state = stateFrom(match)
    if (state === undefined) throw new Error('turn-interrupted start requires an interrupted turn/end')
    return state
  },
  update: context => context.state,
  buildViewNode: (context: ConversationNodeContext<TurnInterruptedData>): ChatConversationViewNode | null => {
    const state = context.state
    if (state === undefined) return null
    return {
      key: context.key,
      kind: 'turn-interrupted',
      id: context.id,
      target: 'chat',
      anchorSeq: state.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: state,
    }
  },
}

/**
 * Register the crash-recovery turn contribution.
 * @param ctx - client context carrying the Conversation assembly.
 * @returns the registry disposer.
 */
export function registerTurnInterrupted(ctx: Context): () => void {
  return ctx.uiConversation.events.register(turnInterruptedDefinition)
}
