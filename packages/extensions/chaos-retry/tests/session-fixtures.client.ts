// Snapshot fixtures shared by the chaos-retry client specs.
//
// Detection reads the Chat target (session.chat), so these build a real
// order/nodes pair; the legacy `nodes` slice stays alongside because the
// resend text still comes from it.

import type {
  ChatConversationViewNode, ConversationNode, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'

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
export function chatSnapshotOf(nodes: readonly ChatConversationViewNode[]) {
  const byKey = new Map(nodes.map(node => [node.key, node]))
  return {
    order: nodes.map(node => node.key),
    nodes: {
      get: (key: string) => byKey.get(key),
      values: () => nodes,
    },
    locations: { getTurn: () => [], getStep: () => [] },
    timeline: { turnOrder: [], turns: new Map() },
    legacy: {
      nodes: [],
      turnTimings: new Map(),
      turnEnds: new Map(),
      partial: null,
      runningCalls: [],
    },
  }
}

/** Minimal idle-session fixture whose Chat tail is one terminal error row. */
export function makeSession(
  over: Partial<ConversationSnapshot> & { chatNodes?: readonly ChatConversationViewNode[] } = {},
): ConversationSnapshot {
  const { chatNodes, ...rest } = over
  const tail = chatNodes ?? [chatNode('turn-error', { message: 'provider overloaded' })]
  return {
    running: false,
    removed: false,
    partial: null,
    queue: [],
    pending: [],
    nodes: [userNode('帮我看看这个报错')],
    chat: chatSnapshotOf(tail),
    ...rest,
  } as ConversationSnapshot
}
