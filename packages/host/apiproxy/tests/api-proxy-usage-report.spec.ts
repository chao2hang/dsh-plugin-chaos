/** Durable all-history usage-report API integration. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { RpcRequest, UsageReportReadRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

const sid = (value: string): SessionId => value as SessionId
const defaults = { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }
const event = (value: unknown): SessionEvent => value as SessionEvent

function header(id: string): SessionHeader {
  return { version: 0, id: sid(id), createdAt: 1, cwd: '/project' }
}

function request(timeZone = 'UTC'): RpcRequest<UsageReportReadRequest> {
  return { rpcId: RpcId('usage-report'), payload: { timeZone } }
}

async function baseContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(UserQuestionService)
  return ctx
}

describe('usage-report.read', () => {
  it('caches one stable viewer report, separates time zones, and invalidates completed usage', async () => {
    const ctx = await baseContext()
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
    const listSnapshots = vi.fn(async () => [
      { header: first, revision: `first-${revision}` },
      { header: second, revision: `second-${revision}` },
    ])
    ctx.provide('sessionPersistence', { listSnapshots } as never)
    const signal = new AbortController().signal
    const proxy = createApiProxy(ctx, defaults)

    const response = await proxy.usageReport.read(request('Asia/Shanghai'), signal)

    expect(response.result).toEqual({
      ok: true,
      value: {
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
      },
    })
    expect(listSessions).toHaveBeenCalledWith(signal)
    expect(projectSessions).toHaveBeenCalledWith([first.id, second.id], expect.any(Function), signal)
    expect(projectSessions).toHaveBeenCalledTimes(1)
    expect(listSnapshots).toHaveBeenCalledTimes(2)

    const cached = await proxy.usageReport.read(request('Asia/Shanghai'), signal)
    expect(cached.result).toEqual(response.result)
    expect(projectSessions).toHaveBeenCalledTimes(1)
    expect(listSnapshots).toHaveBeenCalledTimes(3)

    await proxy.usageReport.read(request('UTC'), signal)
    expect(projectSessions).toHaveBeenCalledTimes(2)

    ctx.emit('session/event', {} as Session, event({
      type: 'assistant/message', seq: 2, time: Date.parse('2026-08-21T18:01:00.000Z'),
      data: { usage: { inputTokens: 1, outputTokens: 1 }, turn: 1, step: 2, message: { role: 'assistant', content: [] } }, surfaceOp: 'append',
    }))
    await proxy.usageReport.read(request('Asia/Shanghai'), signal)
    expect(projectSessions).toHaveBeenCalledTimes(3)

    revision += 1
    await proxy.usageReport.read(request('Asia/Shanghai'), signal)
    expect(projectSessions).toHaveBeenCalledTimes(4)
  })

  it('does not retain a report that races a completed request', async () => {
    const ctx = await baseContext()
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
    const proxy = createApiProxy(ctx, defaults)

    const initial = proxy.usageReport.read(request())
    await projectionPending
    ctx.emit('session/event', {} as Session, event({
      type: 'assistant/message', seq: 0, time: 1,
      data: { usage: { inputTokens: 1, outputTokens: 1 }, turn: 1, step: 1, message: { role: 'assistant', content: [] } }, surfaceOp: 'append',
    }))
    releaseProjection()
    await initial

    await proxy.usageReport.read(request())
    expect(projectSessions).toHaveBeenCalledTimes(2)
  })

  it('maps cancellation before or during durable inspection onto the wire cancellation code', async () => {
    const ctx = await baseContext()
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    ctx.provide('sessionQuery', {
      listSessions: vi.fn(() => Promise.reject(new Error('stop'))),
      projectSessions: vi.fn(),
    } as never)

    const response = await createApiProxy(ctx, defaults).usageReport.read(request(), controller.signal)

    expect(response.result).toEqual({
      ok: false,
      error: { code: 'cancelled', message: 'usage report read was cancelled', details: {} },
    })
  })

  it('fails the report rather than silently omitting a log that could not be projected', async () => {
    const ctx = await baseContext()
    const source = header('source')
    const projectSessions = vi.fn(() => Promise.resolve([{ sessionId: source.id, status: 'rejected' as const, reason: new Error('corrupt') }]))
    ctx.provide('sessionQuery', {
      listSessions: () => Promise.resolve([{ header: source, live: false, persisted: true }]),
      projectSessions,
    } as never)
    const proxy = createApiProxy(ctx, defaults)

    const response = await proxy.usageReport.read(request())

    expect(response.result).toMatchObject({ ok: false, error: { code: 'internal', message: 'usage report unavailable: Error: corrupt' } })
    await proxy.usageReport.read(request())
    expect(projectSessions).toHaveBeenCalledTimes(2)
  })
})
