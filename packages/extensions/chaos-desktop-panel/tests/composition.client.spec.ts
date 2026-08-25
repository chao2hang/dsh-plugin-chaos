// @vitest-environment jsdom
// REAL-composition test: boots the production slot registry and ui-layout before
// mounting the desktop workbench, then proves its slot contribution disposes.
import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply as layoutApply, inject as layoutInject } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => { vi.restoreAllMocks() })

/** Boot the production layout stack required by the additive shell overlay. */
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
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { slots: ctx.get('slots') as SlotRegistry, fiber }
}

describe('chaos-desktop-panel REAL-composition through Cordis Context', () => {
  it('declares the slot service dependency', () => {
    expect(inject).toEqual(['slots'])
  })

  it('registers the workbench in the production shell overlay', async () => {
    const { slots, fiber } = await bench()
    const entries = slots.entries('shell.overlay')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options).toMatchObject({ id: 'chaos-desktop-panel', priority: 3 })
    await fiber.dispose()
  })

  it('removes the workbench registration when its fiber disposes', async () => {
    const { slots, fiber } = await bench()
    expect(slots.entries('shell.overlay')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  })
})
