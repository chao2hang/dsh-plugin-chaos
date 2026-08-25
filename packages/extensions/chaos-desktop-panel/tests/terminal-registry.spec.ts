import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import { BrowserTerminalRegistry } from '../src/terminal-registry.ts'

type Handle = SubprocessTerminalHandle & {
  output: PassThrough
  done: SubprocessTerminalHandle['done']
  write: ReturnType<typeof vi.fn>
  signalForeground: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}
function handle(): Handle {
  const output = new PassThrough()
  return {
    pid: 1,
    output,
    done: new Promise(() => {}),
    write: vi.fn(async () => {}),
    inspectForeground: vi.fn(async () => undefined),
    signalForeground: vi.fn(async () => 0),
    terminate: vi.fn(async () => {}),
  }
}
function settledHandle(): Handle {
  const output = new PassThrough()
  return {
    pid: 1,
    output,
    done: Promise.resolve({ exitCode: 0, signal: null }),
    write: vi.fn(async () => {}),
    inspectForeground: vi.fn(async () => undefined),
    signalForeground: vi.fn(async () => 0),
    terminate: vi.fn(async () => {}),
  }
}

describe('browser terminal registry', () => {
  it('reconnects a matching session/tab terminal and replays bounded output', async () => {
    const first = handle(); const spawn = vi.fn(async () => first)
    const registry = new BrowserTerminalRegistry({ spawn, reconnectGraceMs: 1_000, transcriptBytes: 5 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30)
    first.output.write('123456')
    await new Promise(resolve => setImmediate(resolve))
    expect(terminal.transcript).toBe('23456')
    expect(await registry.open('session', 'tab', '/workspace', 100, 40)).toBe(terminal)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('keeps terminal transcripts isolated by tab identity', async () => {
    const right = handle(); const bottom = handle(); const spawn = vi.fn().mockResolvedValueOnce(right).mockResolvedValueOnce(bottom)
    const registry = new BrowserTerminalRegistry({ spawn, reconnectGraceMs: 100, transcriptBytes: 100 })
    const first = await registry.open('session', 'right', '/workspace', 80, 30)
    const second = await registry.open('session', 'bottom', '/workspace', 80, 30)
    right.output.write('right output'); bottom.output.write('bottom output')
    await new Promise(resolve => setImmediate(resolve))
    expect(first).not.toBe(second); expect(first.transcript).toBe('right output'); expect(second.transcript).toBe('bottom output')
  })

  it('keeps UTF-8 replay aligned to character boundaries', async () => {
    const current = handle()
    const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 4 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30)
    current.output.write('a界b'); await new Promise(resolve => setImmediate(resolve))
    expect(terminal.transcript).toBe('界b')
  })

  it('streams output to subscribers and stops after unsubscribe', async () => {
    const current = handle()
    const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 100 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30); const output = vi.fn()
    const unsubscribe = registry.subscribe(terminal, output)
    current.output.write('hello'); await new Promise(resolve => setImmediate(resolve)); unsubscribe()
    current.output.write('ignored'); await new Promise(resolve => setImmediate(resolve))
    expect(output).toHaveBeenCalledExactlyOnceWith('hello')
  })

  it('notifies exit subscribers after a terminal exits', async () => {
    const registry = new BrowserTerminalRegistry({ spawn: async () => settledHandle(), reconnectGraceMs: 100, transcriptBytes: 100 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30); const exited = vi.fn()
    registry.subscribeExit(terminal, exited); await new Promise(resolve => setImmediate(resolve))
    expect(terminal.exited).toBe(true); expect(exited).toHaveBeenCalledOnce()
  })

  it('signals the live foreground process without writing control bytes', async () => {
    const current = handle()
    const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 100 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30); registry.signal(terminal)
    await Promise.resolve(); expect(current.signalForeground).toHaveBeenCalledWith('SIGINT'); expect(current.write).not.toHaveBeenCalled()
  })

  it('does not write to an exited terminal', async () => {
    const current = settledHandle()
    const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 100 })
    const terminal = await registry.open('session', 'tab', '/workspace', 80, 30); await new Promise(resolve => setImmediate(resolve))
    registry.write(terminal, 'after-exit'); await terminal.write
    expect(current.write).not.toHaveBeenCalled()
  })

  it('cancels reconnect cleanup when the same terminal reopens', async () => {
    vi.useFakeTimers()
    try {
      const current = handle(); const spawn = vi.fn(async () => current)
      const registry = new BrowserTerminalRegistry({ spawn, reconnectGraceMs: 100, transcriptBytes: 100 })
      const terminal = await registry.open('session', 'tab', '/workspace', 80, 30)
      registry.scheduleClose('session', 'tab'); await vi.advanceTimersByTimeAsync(50)
      expect(await registry.open('session', 'tab', '/workspace', 100, 40)).toBe(terminal)
      await vi.advanceTimersByTimeAsync(100)
      expect(current.terminate).not.toHaveBeenCalled(); expect(spawn).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('keeps a shared terminal alive while another viewer remains subscribed', async () => {
    vi.useFakeTimers()
    try {
      const current = handle()
      const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 100 })
      const terminal = await registry.open('session', 'tab', '/workspace', 80, 30)
      const first = registry.subscribe(terminal, () => {}); const second = registry.subscribe(terminal, () => {})
      first(); registry.scheduleClose('session', 'tab'); await vi.advanceTimersByTimeAsync(100)
      expect(current.terminate).not.toHaveBeenCalled()
      second(); registry.scheduleClose('session', 'tab'); await vi.advanceTimersByTimeAsync(100)
      expect(current.terminate).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('serializes writes and cleans up after reconnect grace', async () => {
    vi.useFakeTimers()
    try {
      const current = handle()
      const registry = new BrowserTerminalRegistry({ spawn: async () => current, reconnectGraceMs: 100, transcriptBytes: 100 })
      const terminal = await registry.open('session', 'tab', '/workspace', 80, 30)
      registry.write(terminal, 'first'); registry.write(terminal, 'second')
      await terminal.write
      expect(current.write.mock.calls).toEqual([['first'], ['second']])
      registry.scheduleClose('session', 'tab')
      await vi.advanceTimersByTimeAsync(100)
      expect(current.terminate).toHaveBeenCalledOnce()
      expect(registry.get('session', 'tab')).toBeUndefined()
    } finally { vi.useRealTimers() }
  })

  it('terminates every live terminal on disposal', async () => {
    const one = handle(); const two = handle(); const spawn = vi.fn().mockResolvedValueOnce(one).mockResolvedValueOnce(two)
    const registry = new BrowserTerminalRegistry({ spawn, reconnectGraceMs: 100, transcriptBytes: 100 })
    await registry.open('one', 'tab', '/one', 80, 30); await registry.open('two', 'tab', '/two', 80, 30)
    await registry.dispose()
    expect(one.terminate).toHaveBeenCalledOnce(); expect(two.terminate).toHaveBeenCalledOnce()
  })
})
