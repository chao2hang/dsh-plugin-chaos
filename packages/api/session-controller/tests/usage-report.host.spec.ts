/** Durable all-history usage-report Remote integration over the controller. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { UsageReportController } from '../src/usage-report.ts'

const event = (value: unknown): SessionEvent => value as SessionEvent

function header(id: string): SessionHeader {
  return { version: 0 as never, isSeeded: false, id: id as SessionId, createdAt: 1, cwd: '/project' }
}

describe('UsageReportController', () => {
  it('publishes the usage-report namespace with its single read method', () => {
    const controller = new UsageReportController(new Context())
    expect(controller.typertRemote.serviceKey).toBe('usageReportController')
    expect(controller.typertRemote.namespace).toBe('usage-report')
    expect(remoteMethods(controller)).toEqual([
      { method: 'read', invocation: { kind: 'direct' } },
    ])
  })
  it('caches one stable viewer report, separates time zones, and invalidates completed usage', async () => {
    const ctx = new Context()
    const first = header('first')
    const second = header('second')
    const listSessions = vi.fn(async () => [
      { header: first, live: true, persisted: true },
      { header: second, live: false, persisted: true },
    ])
    const projectSessions = vi.fn((
      _sessionIds: readonly SessionId[],
      project: (source: { header: SessionHeader; events: readonly SessionEvent[] }) => unknown,
    ) => Promise.resolve([
      {
        sessionId: first.id,
        status: 'fulfilled' as const,
        value: project({
          header: first,
          events: [
            event({ type: 'request/context', seq: 0, time: 1, data: { provider: 'deepseek', model: 'reasoner' } }),
            event({ type: 'assistant/message', seq: 1, time: Date.parse('2026-08-21T12:00:00.000Z'), data: { usage: { inputTokens: 10, outputTokens: 4 }, turn: 1, step: 1, message: { role: 'assistant', content: [] } }, surfaceOp: 'append' }),
          ],
        }),
      },
      {
        sessionId: second.id,
        status: 'fulfilled' as const,
        value: project({
          header: second,
          events: [
            event({ type: 'request/context', seq: 0, time: 1, data: { provider: 'openai', model: 'gpt' } }),
            event({ type: 'assistant/message', seq: 1, time: Date.parse('2026-08-21T18:00:00.000Z'), data: { usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 3 }, turn: 1, step: 1, message: { role: 'assistant', content: [] } }, surfaceOp: 'append' }),
          ],
        }),
      },
    ]))
    ctx.provide('sessionQuery', { listSessions, projectSessions } as never)
    let revision = 0
    const list = vi.fn(async () => [
      { header: first, revision: `first-${revision}` },
      { header: second, revision: `second-${revision}` },
    ])
    ctx.provide('sessionPersistence', { list } as never)
    const signal = new AbortController().signal
    const controller = new UsageReportController(ctx)

    const report = await controller.read({ timeZone: 'Asia/Shanghai' }, signal)

    expect(report).toEqual({
      days: [
        {
          date: '2026-08-21', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0,
          routes: [{ provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 }],
        },
        {
          date: '2026-08-22', requests: 1, inputTokens: 2, outputTokens: 1, cacheReadTokens: 3, cacheWriteTokens: 0,
          routes: [{ provider: 'openai', model: 'gpt', requests: 1, inputTokens: 2, outputTokens: 1, cacheReadTokens: 3, cacheWriteTokens: 0 }],
        },
      ],
      models: [
        { provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 2, outputTokens: 1, cacheReadTokens: 3, cacheWriteTokens: 0 },
      ],
      unattributed: { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
    expect(listSessions).toHaveBeenCalledWith(signal)
    expect(projectSessions).toHaveBeenCalledWith([first.id, second.id], expect.any(Function), signal)
    expect(projectSessions).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(2)

    const cached = await controller.read({ timeZone: 'Asia/Shanghai' }, signal)
    expect(cached).toEqual(report)
    expect(projectSessions).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(3)

    await controller.read({ timeZone: 'UTC' }, signal)
    expect(projectSessions).toHaveBeenCalledTimes(2)

    ctx.emit('session/event', {} as Session, event({
      type: 'assistant/message', seq: 2, time: Date.parse('2026-08-21T18:01:00.000Z'),
      data: { usage: { inputTokens: 1, outputTokens: 1 }, turn: 1, step: 2, message: { role: 'assistant', content: [] } }, surfaceOp: 'append',
    }))
    await controller.read({ timeZone: 'Asia/Shanghai' }, signal)
    expect(projectSessions).toHaveBeenCalledTimes(3)

    revision += 1
    await controller.read({ timeZone: 'Asia/Shanghai' }, signal)
    expect(projectSessions).toHaveBeenCalledTimes(4)
  })

  it('does not retain a report that races a completed request', async () => {
    const ctx = new Context()
    const source = header('source')
    let releaseProjection!: () => void
    const projectionReleased = new Promise<void>((resolve) => { releaseProjection = resolve })
    let projectionStarted!: () => void
    const projectionPending = new Promise<void>((resolve) => { projectionStarted = resolve })
    const projectSessions = vi.fn(async (
      _sessionIds: readonly SessionId[],
      project: (source: { header: SessionHeader; events: readonly SessionEvent[] }) => unknown,
    ) => {
      projectionStarted()
      await projectionReleased
      return [{ sessionId: source.id, status: 'fulfilled' as const, value: project({ header: source, events: [] }) }]
    })
    ctx.provide('sessionQuery', {
      listSessions: () => Promise.resolve([{ header: source, live: true, persisted: false }]),
      projectSessions,
    } as never)
    const controller = new UsageReportController(ctx)
    const signal = new AbortController().signal

    const initial = controller.read({ timeZone: 'UTC' }, signal)
    await projectionPending
    ctx.emit('session/event', {} as Session, event({
      type: 'assistant/message', seq: 0, time: 1,
      data: { usage: { inputTokens: 1, outputTokens: 1 }, turn: 1, step: 1, message: { role: 'assistant', content: [] } }, surfaceOp: 'append',
    }))
    releaseProjection()
    await initial

    await controller.read({ timeZone: 'UTC' }, signal)
    expect(projectSessions).toHaveBeenCalledTimes(2)
  })

  it('maps cancellation before or during durable inspection onto the wire cancellation code', async () => {
    const ctx = new Context()
    const abort = new AbortController()
    abort.abort(new Error('stop'))
    ctx.provide('sessionQuery', {
      listSessions: vi.fn(() => Promise.reject(new Error('stop'))),
      projectSessions: vi.fn(),
    } as never)
    const controller = new UsageReportController(ctx)

    await expect(controller.read({ timeZone: 'UTC' }, abort.signal)).rejects.toMatchObject({
      code: 'gateway/cancelled',
      message: 'usage report read was cancelled',
    })
  })

  it('fails the report rather than silently omitting a log that could not be projected', async () => {
    const ctx = new Context()
    const source = header('source')
    const projectSessions = vi.fn(() => Promise.resolve([{ sessionId: source.id, status: 'rejected' as const, reason: new Error('corrupt') }]))
    ctx.provide('sessionQuery', {
      listSessions: () => Promise.resolve([{ header: source, live: false, persisted: true }]),
      projectSessions,
    } as never)
    const controller = new UsageReportController(ctx)
    const signal = new AbortController().signal

    await expect(controller.read({ timeZone: 'UTC' }, signal)).rejects.toMatchObject({
      code: 'gateway/internal',
      message: 'usage report unavailable: corrupt',
    })
    await expect(controller.read({ timeZone: 'UTC' }, signal)).rejects.toMatchObject({ code: 'gateway/internal' })
    expect(projectSessions).toHaveBeenCalledTimes(2)
  })

  it('rejects an unsupported viewer time zone as a gateway bad-request', async () => {
    const ctx = new Context()
    const listSessions = vi.fn()
    ctx.provide('sessionQuery', { listSessions, projectSessions: vi.fn() } as never)
    const controller = new UsageReportController(ctx)

    await expect(controller.read({ timeZone: 'Not/AZone' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(listSessions).not.toHaveBeenCalled()
  })
})
