// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { msUntilNextLocalMidnight, UsageReport, usageDays, usageTrendDays } from '../src/client/chat/UsageReport.tsx'
import { en } from '../src/client/locale.ts'

const t = makeTranslate(en, commonEn)
const totals = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
const report = {
  days: [{
    date: '2026-08-23', requests: 3, inputTokens: 30, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    routes: [
      { provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 15, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ],
  }],
  models: [
    { provider: 'deepseek', model: 'reasoner', requests: 1, inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    { provider: 'openai', model: 'gpt', requests: 1, inputTokens: 15, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ],
  unattributed: { requests: 1, inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
}
const usageReport = { read: async () => ({ result: { ok: true as const, value: report } }) }
const props = {
  viewRequest: null,
  openView: () => {},
  completeViewRequest: () => {},
  sessionId: 'first' as never,
  useSession: (() => undefined) as never,
  useChat: (() => undefined) as never,
  useConversation: (() => undefined) as never,
  useInput: (() => undefined) as never,
  inputActions: {} as never,
  useTrajectory: (() => undefined) as never,
  useSessions: (() => undefined) as never,
  useSessionPendingInteraction: (() => undefined) as never,
  useWorkspaces: (() => undefined) as never,
  useProjection: (() => undefined) as never,
  t,
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('UsageReport', () => {
  it('uses server-returned completed-request buckets rather than session timestamps', () => {
    expect(usageDays(report)).toEqual([{ date: '2026-08-23', requests: 3, tokens: 30 }])
  })

  it('schedules a refresh at the next viewer-local calendar-day boundary', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 7, 23, 23, 59, 59).getTime())).toBe(1_000)
    expect(msUntilNextLocalMidnight(new Date(2026, 7, 23).getTime())).toBe(24 * 60 * 60 * 1_000)
  })

  it('densifies the most recent 30 viewer-local calendar days with zero-use days', () => {
    const days = usageTrendDays(report, new Date(2026, 7, 23, 12))

    expect(days).toHaveLength(30)
    expect(days[0]?.date).toBe('2026-07-25')
    expect(days.at(-1)?.date).toBe('2026-08-23')
    expect(days.find(day => day.date === '2026-08-22')).toMatchObject({ requests: 0, tokens: 0, segments: [] })
  })

  it('refreshes completed-request data every 30 seconds while visible', async () => {
    vi.useFakeTimers()
    let calls = 0
    const timeZones: string[] = []
    const live = { read: async (payload: { timeZone: string }) => {
      timeZones.push(payload.timeZone)
      calls += 1
      return { result: { ok: true as const, value: calls === 1 ? report : {
        ...report,
        days: [{
          ...report.days[0]!,
          inputTokens: 40,
          routes: [{ ...report.days[0]!.routes[0]!, inputTokens: 20 }, ...report.days[0]!.routes.slice(1)],
        }],
        models: [{ ...report.models[0]!, inputTokens: 20 }, ...report.models.slice(1)],
      } } }
    } }
    const view = render(<UsageReport {...props} usageReport={live as never} />)

    await act(async () => {})
    expect(view.container.textContent).toContain('30Total tokens')
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve() })
    expect(calls).toBe(2)
    expect(timeZones).toEqual([Intl.DateTimeFormat().resolvedOptions().timeZone, Intl.DateTimeFormat().resolvedOptions().timeZone])
    expect(view.container.textContent).toContain('40Total tokens')
    expect(view.getByText(/Updated at .*refreshes every 30 seconds while visible/)).toBeTruthy()
  })

  it('shows the prior report immediately while a remounted tab refreshes it', async () => {
    let calls = 0
    const refreshPending = new Promise<never>(() => {})
    const endpoint = { read: () => {
      calls += 1
      return calls === 1
        ? Promise.resolve({ result: { ok: true as const, value: report } })
        : refreshPending
    } }
    const first = render(<UsageReport {...props} usageReport={endpoint as never} />)

    await first.findByRole('group', { name: 'Daily token trend' })
    first.unmount()
    const remounted = render(<UsageReport {...props} usageReport={endpoint as never} />)

    expect(remounted.queryByRole('status')).toBeNull()
    expect(remounted.getByRole('group', { name: 'Daily token trend' })).toBeTruthy()
    expect(calls).toBe(2)
  })

  it('shows a structured loading preview while historical usage is read', () => {
    const pending = { read: () => new Promise<never>(() => {}) }
    const view = render(<UsageReport {...props} usageReport={pending as never} />)

    expect(view.getByRole('status').textContent).toContain('Loading historical usage…')
    expect(view.container.querySelectorAll('[data-loading-metric]')).toHaveLength(5)
    expect(view.container.querySelectorAll('[data-loading-bar]')).toHaveLength(12)
  })

  it('keeps all-history cards while omitting data outside the current 30-day window', () => {
    const oldReport = { ...report, days: [{ ...report.days[0]!, date: '2026-06-01' }] }
    const futureReport = { ...report, days: [{ ...report.days[0]!, date: '2026-08-30' }] }
    const now = new Date(2026, 7, 23, 12)

    expect(usageTrendDays(oldReport, now).some(day => day.tokens > 0)).toBe(false)
    expect(usageTrendDays(futureReport, now).at(-1)?.date).toBe('2026-08-23')
    expect(usageDays(oldReport)).toEqual([{ date: '2026-06-01', requests: 3, tokens: 30 }])
  })

  it('renders 30 daily columns, neutral zero days, route segments, and a legend', async () => {
    const view = render(<UsageReport {...props} usageReport={usageReport as never} />)

    await waitFor(() =>{  expect(view.getByRole('group', { name: 'Daily token trend' })).toBeTruthy() })
    expect(view.container.textContent).toContain('30Total tokens')
    expect(view.container.querySelectorAll('[data-date]').length).toBe(30)
    expect(view.container.querySelectorAll('[data-date][data-zero]').length).toBeGreaterThan(0)
    expect(view.container.querySelector('[data-model="deepseek/reasoner"]')).toBeTruthy()
    expect(view.container.querySelector('[data-model="openai/gpt"]')).toBeTruthy()
    expect(view.container.textContent).toContain('deepseek / reasoner')
    expect(view.container.textContent).toContain('openai / gpt')
    expect(view.container.textContent).toContain('Unattributed historical usage')
  })

  it('lets people inspect a selected day without cluttering the time axis', async () => {
    const view = render(<UsageReport {...props} usageReport={usageReport as never} />)

    const activeDay = await view.findByRole('button', { name: /2026-08-23/ })
    expect(activeDay.getAttribute('aria-pressed')).toBe('true')
    expect(view.getByText('Selected date').parentElement?.textContent).toContain('2026-08-23')
    fireEvent.click(view.getByRole('button', { name: /2026-08-22/ }))
    expect(view.getByText('Selected date').parentElement?.textContent).toContain('2026-08-22')
    expect(view.getByText('No completed requests on this date.')).toBeTruthy()
  })

  it('shows the empty state for a real report with no completed requests', async () => {
    const empty = { days: [], models: [], unattributed: totals }
    const view = render(<UsageReport {...props} usageReport={{ read: async () => ({ result: { ok: true as const, value: empty } }) }} />)

    await waitFor(() =>{  expect(view.getByText('No completed-request usage has been recorded yet.')).toBeTruthy() })
  })

  it('keeps the tab open when an older client API has no report endpoint', async () => {
    const view = render(<UsageReport {...props} />)

    await waitFor(() =>{  expect(view.getByRole('alert')).toBeTruthy() })
    expect(view.getByText('Historical usage could not be read.')).toBeTruthy()
  })

  it('shows a retry action after a transport or RPC failure', async () => {
    let calls = 0
    const failing = { read: async () => {
      calls += 1
      return calls === 1 ? { result: { ok: false as const } } : { result: { ok: true as const, value: report } }
    } }
    const view = render(<UsageReport {...props} usageReport={failing as never} />)

    await waitFor(() =>{  expect(view.getByRole('alert')).toBeTruthy() })
    fireEvent.click(view.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>{  expect(view.getByRole('group', { name: 'Daily token trend' })).toBeTruthy() })
    expect(calls).toBe(2)
  })
})
