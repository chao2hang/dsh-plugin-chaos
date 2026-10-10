// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'

/** Minimal component used to declare and occupy the test slot. */
const Frame = () => null

/** Mount the production slot registry and declare the keyed chat-node seat. */
async function bench() {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  await slotsFiber.await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.chat.node': { kind: 'keyed', scope: 'session' } },
  } as never, Frame as never)
  return { ctx, slots: ctx.slots }
}

describe('chaos-think-tags renderer override', () => {
  it('shadows and restores the default assistant renderer across remount', async () => {
    const { ctx, slots } = await bench()
    const defaultFiber = ctx.plugin(() => {
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node', key: 'assistant-step',
      }, Frame))
    })
    await defaultFiber.await()

    const first = ctx.plugin({ inject, apply })
    await first.await()
    expect(slots.entries('conversation.chat.node').map(entry => entry.options.priority ?? 0)).toEqual([-1, 0])
    expect(slots.entriesOfSlot('conversation.chat.node')[0]?.options.priority).toBe(-1)

    await first.dispose()
    expect(slots.entriesOfSlot('conversation.chat.node')[0]?.options.priority ?? 0).toBe(0)

    const reloaded = ctx.plugin({ inject, apply })
    await reloaded.await()
    expect(slots.entries('conversation.chat.node').map(entry => entry.options.priority ?? 0)).toEqual([-1, 0])
    await reloaded.dispose()
    await defaultFiber.dispose()
  })
})
