// @vitest-environment jsdom
// REAL-composition test: boots the actual SlotRegistry + ui-layout + chaos-mobile
// through Cordis Context (not hand-built ctx.plugin), and verifies the mobile
// overlay registers into the shell.overlay slot with the correct inject face.
import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply as layoutApply, inject as layoutInject } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Boot the real slot registry + theme + layout, then mount chaos-mobile on top.
 * This mirrors the composition path: theme → slots → layout → chaos-mobile.
 * conversation.input.left is declared by ui-conversation (not booted here),
 * so only the shell.overlay registration is asserted.
 */
async function bench() {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: themeInject, apply: themeApply }).await()
  await slotsFiber.await()
  await ctx.plugin({ inject: layoutInject, apply: layoutApply }).await()

  // chaos-mobile also requires 'conversation' — provide a minimal stub.
  ctx.provide('conversation', { createDraftImages: () => [], releaseDraftImages: () => {} } as never)
  // ...and 'uiWorkspace' for the overflow sheet's new-session action.
  ctx.provide('uiWorkspace', { startSession: () => {} } as never)

  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, fiber }
}

describe('chaos-mobile REAL-composition through Cordis Context', () => {
  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'conversation', 'layout', 'uiWorkspace'])
  })

  it('registers into the shell.overlay slot with the correct inject face', async () => {
    const { slots, fiber } = await bench()
    const entries = slots.entries('shell.overlay')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.options.id).toBe('chaos-mobile')
    expect(entry.options.priority).toBe(-1)

    // The inject face provides toggleSidebar and closeDetails routed through
    // the layout service (the real LayoutController, not a mock).
    const injected = (entry.inject as ((props: unknown) => unknown) | undefined)?.({}) as {
      toggleSidebar: () => void
      openDetails: () => void
      closeDetails: () => void
      newSession: () => void
    } | undefined
    expect(injected).toBeDefined()
    expect(typeof injected!.toggleSidebar).toBe('function')
    expect(typeof injected!.openDetails).toBe('function')
    expect(typeof injected!.closeDetails).toBe('function')
    expect(typeof injected!.newSession).toBe('function')

    await fiber.dispose()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  })

  it('teardown removes the shell.overlay registration', async () => {
    const { slots, fiber } = await bench()
    expect(slots.entries('shell.overlay')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  })

  it('injects the mobile CSS style tag on mount and removes it on dispose', async () => {
    const { fiber } = await bench()
    const styleTag = document.head.querySelector<HTMLStyleElement>('style[data-plugin="@deepseek-ai/dsh-plugin-chaos-mobile"]')
    expect(styleTag).not.toBeNull()
    // The style tag exists; content may be empty in jsdom (CSS ?inline import
    // is environment-dependent), so only assert the tag's lifecycle.
    await fiber.dispose()
    expect(document.head.querySelector('style[data-plugin="@deepseek-ai/dsh-plugin-chaos-mobile"]')).toBeNull()
  })
})
