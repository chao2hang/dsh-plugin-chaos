// Snapshot fixtures shared by the chaos-retry client specs.
//
// Detection reads the split Session lifecycle snapshot and the Chat target, so
// these build a real Chat order/nodes pair; the legacy `nodes` slice rides
// inside the Chat snapshot because the resend text still comes from it.

import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ChatConversationViewNode, ChatSnapshot, LegacyConversationSlice,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AbnormalEndInput } from '../src/client/retry-model.ts'

export const SID = 's1' as SessionId

export function userNode(text: string, seq = 1): ConversationNode {
  return { kind: 'user', seq, time: seq, content: [{ type: 'text', text }], source: {} }
}

/** One visible Chat node of the given kind, keyed by its index. */
export function chatNode(kind: string, data: unknown = {}, anchorSeq = 10): ChatConversationViewNode {
  return {
    key: `${kind}:${String(anchorSeq)}`,
    kind,
    id: String(anchorSeq),
    target: 'chat',
    anchorSeq,
    location: { kind: 'unresolved' },
    visibility: 'visible',
    data,
  }
}

/** Assemble the Chat target from an ordered node list. */
export function chatSnapshotOf(
  nodes: readonly ChatConversationViewNode[],
  legacy: Partial<LegacyConversationSlice> = {},
): ChatSnapshot {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    order: nodes.map(node => node.key),
    nodes: {
      get: (key: string) => byKey.get(key),
      source: (key: string) => ({
        getSnapshot: () => byKey.get(key),
        subscribe: () => () => {},
      }),
      processSource: () => ({
        getSnapshot: () => undefined,
        subscribe: () => () => {},
      }),
      values: () => nodes,
    },
    locations: { getTurn: () => [], getStep: () => [] },
    navigation: { items: () => [] },
    timeline: { turnOrder: [], turns: new Map() },
    legacy: {
      nodes: [],
      turnTimings: new Map(),
      turnEnds: new Map(),
      partial: null,
      runningCalls: [],
      ...legacy,
    },
  }
}

/** Overrides for the split snapshot fixture. */
export interface SessionFixtureOverrides {
  /** Chat tail rows. */
  chatNodes?: readonly ChatConversationViewNode[]
  /** Legacy finalized nodes the resend text comes from. */
  legacyNodes?: readonly ConversationNode[]
  /** Session lifecycle facts. */
  session?: Partial<SessionSnapshot>
  /** Whole Chat target replacement. */
  chat?: ChatSnapshot | undefined
  /** The Session's effective pending interaction. */
  pendingInteraction?: SessionPendingInteraction
}

/** Minimal idle-session fixture whose Chat tail is one terminal error row. */
export function makeSession(over: SessionFixtureOverrides = {}): AbnormalEndInput {
  const { chatNodes, legacyNodes, session, chat, pendingInteraction } = over
  const tail = chatNodes ?? [chatNode('turn-error', { message: 'provider overloaded' })]
  return {
    session: {
      sessionId: SID,
      queue: [],
      pendingSubmissions: [],
      running: false,
      subagent: null,
      removed: false,
      openState: 'open',
      openError: null,
      hasMore: false,
      loadingOlder: false,
      promptError: null,
      blank: false,
      lastAgentError: null,
      promptAttempted: true,
      awaitingFirstTurn: false,
      ...session,
    },
    // An explicit `chat: undefined` keeps the target absent (unregistered).
    chat: 'chat' in over ? chat : chatSnapshotOf(tail, { nodes: legacyNodes ?? [userNode('帮我看看这个报错')] }),
    pendingInteraction,
  }
}
