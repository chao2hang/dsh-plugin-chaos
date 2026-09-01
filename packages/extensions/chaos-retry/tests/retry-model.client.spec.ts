// @vitest-environment jsdom
// Abnormal-end derivation: which Chat tails offer the retry strip, and which
// user text the strip would resend.

import { describe, expect, it } from 'vitest'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { PendingApproval } from '@deepseek-ai/dsh-client-ui-approval/src/client/contract/slots.ts'
import type { ConversationNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { detectAbnormalEnd, lastUserTextOf } from '../src/client/retry-model.ts'
import { SID, chatNode, chatSnapshotOf, makeSession, userNode } from './session-fixtures.client.ts'

describe('detectAbnormalEnd', () => {
  it('reports a terminal turn error with its failure message', () => {
    expect(detectAbnormalEnd(makeSession())).toEqual({ kind: 'error', message: 'provider overloaded' })
  })

  it('reports the output-token cap', () => {
    const session = makeSession({ chatNodes: [chatNode('turn-max-tokens')] })
    expect(detectAbnormalEnd(session)).toEqual({ kind: 'max-tokens' })
  })

  it('reports an interrupted assistant prefix', () => {
    const session = makeSession({ chatNodes: [chatNode('assistant-step', { status: 'interrupted' })] })
    expect(detectAbnormalEnd(session)).toEqual({ kind: 'interrupted' })
  })

  // The crash-recovery row is why this package contributes a node Definition:
  // a turn killed before its first token has no assistant evidence at all.
  it('reports a crash-recovery closure with no streamed content', () => {
    const session = makeSession({ chatNodes: [chatNode('turn-interrupted', { turn: 1, seq: 10, time: 10 })] })
    expect(detectAbnormalEnd(session)).toEqual({ kind: 'crashed' })
  })

  it('looks past the turn-tail footer to the terminal row', () => {
    const session = makeSession({
      chatNodes: [chatNode('turn-interrupted', {}, 10), chatNode('turn-tail', {}, 11)],
    })
    expect(detectAbnormalEnd(session)).toEqual({ kind: 'crashed' })
  })

  it('ignores hidden rows when reading the tail', () => {
    const hidden = { ...chatNode('turn-error', { message: 'x' }, 12), visibility: 'hidden' as const }
    const session = makeSession({ chatNodes: [chatNode('turn-interrupted', {}, 10), hidden] })
    expect(detectAbnormalEnd(session)).toEqual({ kind: 'crashed' })
  })

  it('stays silent while the turn runs, streams, or keeps queued or pending work', () => {
    expect(detectAbnormalEnd(makeSession({ session: { running: true } }))).toBeNull()
    expect(detectAbnormalEnd(makeSession({
      chat: chatSnapshotOf([chatNode('turn-error', { message: 'provider overloaded' })], {
        partial: { turn: 1, step: 1, blocks: [] },
      }),
    }))).toBeNull()
    expect(detectAbnormalEnd(makeSession({ session: { queue: [{ id: 'q' } as never] } }))).toBeNull()
    expect(detectAbnormalEnd(makeSession({
      pendingInteraction: new PendingApproval(SID, { toolName: 'bash' }),
    }))).toBeNull()
    expect(detectAbnormalEnd(makeSession({ session: { removed: true } }))).toBeNull()
  })

  it('stays silent without a Chat target', () => {
    expect(detectAbnormalEnd(makeSession({ chat: undefined }))).toBeNull()
  })

  it('stays silent for normal endings and for a settled assistant tail', () => {
    expect(detectAbnormalEnd(makeSession({ chatNodes: [] }))).toBeNull()
    const settled = makeSession({ chatNodes: [chatNode('assistant-step', { status: 'settled' })] })
    expect(detectAbnormalEnd(settled)).toBeNull()
    const answered = makeSession({ chatNodes: [chatNode('turn-error', {}, 5), chatNode('user', {}, 9)] })
    expect(detectAbnormalEnd(answered)).toBeNull()
  })
})

describe('lastUserTextOf', () => {
  it('joins the text blocks of the last user message', () => {
    const withSplitText: ConversationNode = {
      kind: 'user', seq: 1, time: 1, source: {},
      content: [{ type: 'text', text: '第一句' }, { type: 'text', text: '第二行' }],
    }
    expect(lastUserTextOf([withSplitText])).toBe('第一句\n第二行')
  })

  it('skips back to the last user node across non-user rows', () => {
    const assistant: ConversationNode = {
      kind: 'assistant', seq: 5, time: 5, turn: 1, step: 1, blocks: [],
    }
    expect(lastUserTextOf([userNode('最早的'), assistant])).toBe('最早的')
  })

  it('answers null without any user text to resend', () => {
    expect(lastUserTextOf([])).toBeNull()
    const imageOnly: ConversationNode = {
      kind: 'user', seq: 2, time: 2, source: {},
      content: [{ type: 'image', attachment: { attachmentId: AttachmentId('a1'), mediaType: 'image/png', bytes: 4, width: 1, height: 1 } }],
    }
    expect(lastUserTextOf([imageOnly])).toBeNull()
  })
})
