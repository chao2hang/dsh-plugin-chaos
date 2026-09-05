import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { internals, ProcessControlService } from '../src/index.ts'

const originalSpawn = internals.spawn
const contexts: Context[] = []

afterEach(async () => {
  internals.spawn = originalSpawn
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function createService(exit?: (code: number) => Promise<void>): ProcessControlService {
  const ctx = new Context()
  contexts.push(ctx)
  if (exit !== undefined) ctx.provide('appExit', exit)
  return new ProcessControlService(ctx)
}

function child() {
  return { unref: vi.fn() } as unknown as ReturnType<typeof originalSpawn>
}

describe('ProcessControlService', () => {
  it('does not offer restart without launcher-owned quiescent shutdown', () => {
    expect(createService().canRestart).toBe(false)
  })

  it('refuses restart without a launch command', async () => {
    const argv = process.argv
    process.argv = [argv[0]!]
    try {
      const service = createService(async () => {})
      expect(service.canRestart).toBe(false)
      await expect(service.restart()).resolves.toEqual({ ok: false, reason: 'no quiescent launch command available' })
    } finally {
      process.argv = argv
    }
  })

  it('releases the application tree before spawning its detached successor', async () => {
    let release!: () => void
    const stopped = new Promise<void>((resolve) => { release = resolve })
    const exit = vi.fn(() => stopped)
    const spawned = child()
    internals.spawn = vi.fn(() => spawned) as typeof internals.spawn
    const service = createService(exit)

    const restarting = service.restart()
    expect(exit).toHaveBeenCalledWith(0)
    expect(internals.spawn).not.toHaveBeenCalled()

    release()
    await expect(restarting).resolves.toEqual({ ok: true })
    expect(internals.spawn).toHaveBeenCalledWith(process.execPath, process.argv.slice(1), expect.objectContaining({
      detached: true,
      stdio: 'inherit',
    }))
    expect(spawned.unref).toHaveBeenCalledOnce()
  })

  it('does not spawn when application teardown fails', async () => {
    internals.spawn = vi.fn() as typeof internals.spawn
    const service = createService(async () => { throw new Error('listener teardown failed') })

    await expect(service.restart()).resolves.toEqual({ ok: false, reason: 'listener teardown failed' })
    expect(internals.spawn).not.toHaveBeenCalled()
  })

  it('refuses a second request while teardown is pending', async () => {
    let release!: () => void
    const stopped = new Promise<void>((resolve) => { release = resolve })
    const spawned = child()
    internals.spawn = vi.fn(() => spawned) as typeof internals.spawn
    const service = createService(() => stopped)

    const first = service.restart()
    await expect(service.restart()).resolves.toEqual({ ok: false, reason: 'restart already pending' })
    release()
    await expect(first).resolves.toEqual({ ok: true })
  })

  it('reports spawn errors after teardown', async () => {
    internals.spawn = vi.fn(() => { throw new Error('spawn failed') })
    const service = createService(async () => {})

    await expect(service.restart()).resolves.toEqual({ ok: false, reason: 'spawn failed' })
  })

  it('normalizes non-Error teardown failures', async () => {
    const service = createService(async () => { throw 'shutdown rejected' })

    await expect(service.restart()).resolves.toEqual({ ok: false, reason: 'shutdown rejected' })
  })
})
