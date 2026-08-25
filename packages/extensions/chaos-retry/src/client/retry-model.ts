/**
 * Pure derivation of the abnormal-end state from a conversation snapshot.
 * The dock renders only when this derivation answers; keeping it side-effect
 * free makes the detection contract unit-testable without React or a wire.
 *
 * The ending is read from the Chat target (`session.chat`), not the legacy
 * `session.nodes` slice: the crash-recovery row this package contributes is a
 * Chat node, and the legacy slice carries only the shipped union.
 */

import type {
  ChatConversationViewNode, ConversationNode, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'

/** One abnormally ended conversation tail the retry strip can offer to resend. */
export interface AbnormalEnd {
  /** How the last turn ended; selects the strip's label. */
  kind: 'error' | 'interrupted' | 'max-tokens' | 'crashed'
  /** Terminal failure message (turn-error only). */
  message?: string
}

/** Chat node kinds that terminate a turn; anything else means the tail is ordinary. */
const TERMINAL_KINDS = new Set(['turn-error', 'turn-max-tokens', 'turn-interrupted'])

/**
 * The last Chat node in render order, ignoring hidden entries.
 * @param session - current conversation snapshot.
 * @returns the trailing visible Chat node, or undefined for an empty transcript.
 */
function lastChatNode(session: ConversationSnapshot): ChatConversationViewNode | undefined {
  const order = session.chat.order
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const key = order[index]
    if (key === undefined) continue
    const node = session.chat.nodes.get(key)
    if (node === undefined || node.visibility !== 'visible') continue
    // The turn-tail is a footer attached to a completed turn: it renders after
    // the terminal row without changing what ended the turn.
    if (node.kind === 'turn-tail') continue
    return node
  }
  return undefined
}

/**
 * Derive the conversation's ending state from the Chat tail.
 * @param session - current conversation snapshot (owner-share currency).
 * @returns the abnormal end when the conversation is idle and its last Chat
 * node is a terminal failure, a crash-recovery closure, an interrupted
 * assistant prefix, or an output-token cap notice; null when the turn is still
 * open, work is queued or awaiting a decision, the session is gone, or the
 * conversation ended normally.
 */
export function detectAbnormalEnd(session: ConversationSnapshot): AbnormalEnd | null {
  if (session.running || session.removed) return null
  // A streaming prefix or a queued/steering inbox row means the turn has not
  // settled into its terminal node yet.
  if (session.partial !== null) return null
  if (session.queue.length > 0 || session.pending.length > 0) return null

  const last = lastChatNode(session)
  if (last === undefined) return null
  if (!TERMINAL_KINDS.has(last.kind) && last.kind !== 'assistant-step') return null

  switch (last.kind) {
    case 'turn-error': {
      const data = last.data as { readonly message?: string }
      return { kind: 'error', ...data.message === undefined ? {} : { message: data.message } }
    }
    case 'turn-max-tokens':
      return { kind: 'max-tokens' }
    case 'turn-interrupted':
      return { kind: 'crashed' }
    case 'assistant-step': {
      const data = last.data as { readonly status?: string }
      return data.status === 'interrupted' ? { kind: 'interrupted' } : null
    }
    default:
      return null
  }
}

/**
 * Collect the visible text of the conversation's last user message.
 * @param nodes - finalized conversation nodes, in surface order.
 * @returns the text blocks joined with newlines, or null when the session has
 * no user message or its last user message carries no text (image-only).
 */
export function lastUserTextOf(nodes: readonly ConversationNode[]): string | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined || node.kind !== 'user') continue
    const text = node.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    return text === '' ? null : text
  }
  return null
}
