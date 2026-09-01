import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { usageReportFromLogs, usageReportFromReports } from '../src/usage-report.ts'

const event = (value: unknown): SessionEvent => value as SessionEvent

describe('usageReportFromLogs', () => {
  it('uses viewer calendar dates and preceding durable model contexts', () => {
    const report = usageReportFromLogs([[
      event({ type: 'request/context', seq: 0, time: Date.parse('2026-08-20T23:59:00.000Z'), data: { provider: 'deepseek', model: 'reasoner' } }),
      event({ type: 'assistant/message', seq: 1, time: Date.parse('2026-08-21T00:01:00.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3 } }, surfaceOp: 'append' }),
      event({ type: 'request/context', seq: 2, time: 2, data: { provider: 'openai', model: 'gpt' } }),
      event({ type: 'assistant/message', seq: 3, time: Date.parse('2026-08-22T12:00:00.000Z'), data: { turn: 1, step: 2, message: { role: 'assistant', content: [] }, usage: { inputTokens: 8, outputTokens: 2, cacheWriteTokens: 1 } }, surfaceOp: 'append' }),
    ], [
      event({ type: 'assistant/message', seq: 0, time: Date.parse('2026-08-22T18:00:00.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 1, outputTokens: 1 } }, surfaceOp: 'append' }),
    ]], 'UTC')

    expect(report.days).toEqual([
      { date: '2026-08-21', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 0, routes: [{ provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 0 }] },
      { date: '2026-08-22', requests: 2, inputTokens: 9, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 1, routes: [{ provider: 'openai', model: 'gpt', requests: 1, inputTokens: 8, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 1 }] },
    ])
    expect(report.models).toEqual([
      { provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 0 },
      { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 8, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 1 },
    ])
    expect(report.unattributed).toEqual({ requests: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it('uses the viewer time zone to put overnight UTC usage on the local day', () => {
    const report = usageReportFromLogs([[event({
      type: 'assistant/message', seq: 0, time: Date.parse('2026-08-23T22:16:00.000Z'),
      data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 2, outputTokens: 3 } }, surfaceOp: 'append',
    })]], 'Asia/Shanghai')

    expect(report.days).toEqual([
      { date: '2026-08-24', requests: 1, inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0, routes: [] },
    ])
  })

  it('keeps legacy response usage un-attributed while retaining its daily total', () => {
    const report = usageReportFromLogs([[event({ type: 'assistant/message', seq: 0, time: Date.parse('2026-08-22T01:00:00.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 2, outputTokens: 3 } }, surfaceOp: 'append' })]])

    expect(report).toEqual({
      days: [{ date: '2026-08-22', requests: 1, inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0, routes: [] }],
      models: [],
      unattributed: { requests: 1, inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it('merges routed per-session reports without losing their day/model join', () => {
    const first = usageReportFromLogs([[
      event({ type: 'request/context', seq: 0, time: 1, data: { provider: 'deepseek', model: 'reasoner' } }),
      event({ type: 'assistant/message', seq: 1, time: Date.parse('2026-08-22T01:00:00.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 2, outputTokens: 3 } }, surfaceOp: 'append' }),
    ]])
    const second = usageReportFromLogs([[
      event({ type: 'request/context', seq: 0, time: 1, data: { provider: 'deepseek', model: 'reasoner' } }),
      event({ type: 'assistant/message', seq: 1, time: Date.parse('2026-08-22T02:00:00.000Z'), data: { turn: 1, step: 1, message: { role: 'assistant', content: [] }, usage: { inputTokens: 5, outputTokens: 7 } }, surfaceOp: 'append' }),
      event({ type: 'request/context', seq: 2, time: 2, data: { provider: 'openai', model: 'gpt' } }),
      event({ type: 'assistant/message', seq: 3, time: Date.parse('2026-08-22T03:00:00.000Z'), data: { turn: 1, step: 2, message: { role: 'assistant', content: [] }, usage: { inputTokens: 1, outputTokens: 1 } }, surfaceOp: 'append' }),
    ]])

    expect(usageReportFromReports([first, second])).toEqual({
      days: [{
        date: '2026-08-22', requests: 3, inputTokens: 8, outputTokens: 11, cacheReadTokens: 0, cacheWriteTokens: 0,
        routes: [
          { provider: 'deepseek', model: 'reasoner', requests: 2, inputTokens: 7, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
          { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        ],
      }],
      models: [
        { provider: 'deepseek', model: 'reasoner', requests: 2, inputTokens: 7, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      ],
      unattributed: { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })
})
