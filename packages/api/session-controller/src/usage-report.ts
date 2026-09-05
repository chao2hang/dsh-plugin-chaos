/**
 * Host owner of the `usage-report` Remote namespace: all-history provider
 * usage reconstructed from durable session events, bucketed per viewer
 * calendar day and recorded model route.
 *
 * @module @deepseek-ai/dsh-api-session-controller/src/usage-report.ts
 */

import { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  UsageReport,
  UsageReportDayRoute,
  UsageReportModel,
  UsageReportReadRequest,
  UsageTotals,
} from './types.ts'

/** Mutable accumulator for one usage bucket, finalized into wire totals. */
interface MutableUsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Mutable accumulator for one provider/model route bucket. */
interface MutableUsageReportRoute extends MutableUsageTotals {
  provider: string
  model: string
}

interface UsageReportDayState extends MutableUsageTotals {
  date: string
  routes: Map<string, MutableUsageReportRoute>
}

interface UsageReportState {
  days: Map<string, UsageReportDayState>
  models: Map<string, MutableUsageReportRoute>
  unattributed: MutableUsageTotals
}

/** Zero-valued request accounting. */
function emptyTotals(): MutableUsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

/** Add one provider-reported response usage record. */
function addUsage(totals: MutableUsageTotals, usage: NonNullable<Extract<SessionEvent, { type: 'assistant/message' }>['data']['usage']>): void {
  totals.requests += 1
  totals.inputTokens += usage.inputTokens
  totals.outputTokens += usage.outputTokens
  totals.cacheReadTokens += usage.cacheReadTokens ?? 0
  totals.cacheWriteTokens += usage.cacheWriteTokens ?? 0
}

/** Add one aggregate's counters to another. */
function addTotals(target: MutableUsageTotals, source: UsageTotals): void {
  target.requests += source.requests
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.cacheReadTokens += source.cacheReadTokens
  target.cacheWriteTokens += source.cacheWriteTokens
}

/** Stable key for one provider/model route. */
function routeKey(provider: string, model: string): string {
  return JSON.stringify([provider, model])
}

/** Deterministic report ordering for provider/model routes. */
function compareRoutes(a: UsageReportDayRoute | UsageReportModel, b: UsageReportDayRoute | UsageReportModel): number {
  return b.requests - a.requests || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model)
}

/** Format durable event times into ISO-like dates for one viewer calendar. */
function viewerDateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** Return the viewer's calendar date for one durable event time. */
function viewerDate(time: number, formatter: Intl.DateTimeFormat): string {
  const fields = Object.fromEntries(formatter.formatToParts(new Date(time)).map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

/** Return the mutable day state for one viewer calendar date. */
function dayState(state: UsageReportState, date: string): UsageReportDayState {
  let day = state.days.get(date)
  if (day === undefined) {
    day = { date, ...emptyTotals(), routes: new Map() }
    state.days.set(date, day)
  }
  return day
}

/** Return the mutable route state for one day. */
function dayRouteState(day: UsageReportDayState, provider: string, model: string): MutableUsageReportRoute {
  const key = routeKey(provider, model)
  let route = day.routes.get(key)
  if (route === undefined) {
    route = { provider, model, ...emptyTotals() }
    day.routes.set(key, route)
  }
  return route
}

/** Return the mutable all-history route state. */
function modelState(state: UsageReportState, provider: string, model: string): MutableUsageReportRoute {
  const key = routeKey(provider, model)
  let route = state.models.get(key)
  if (route === undefined) {
    route = { provider, model, ...emptyTotals() }
    state.models.set(key, route)
  }
  return route
}

/**
 * Fold real request records from one log into report buckets.
 *
 * request/context is logged immediately before dispatch, so a response usage
 * record inherits the latest preceding route. Legacy records without context
 * remain explicitly unattributed rather than borrowing a current selection.
 * @param events - one complete durable session log in sequence order.
 * @param state - mutable aggregate owned by the caller.
 * @param formatter - viewer calendar formatter for date bucketing.
 */
function foldUsageEvents(events: readonly SessionEvent[], state: UsageReportState, formatter: Intl.DateTimeFormat): void {
  let route: { provider: string; model: string } | undefined
  for (const event of events) {
    if (event.type === 'request/context') {
      route = { provider: event.data.provider, model: event.data.model }
      continue
    }
    if (event.type !== 'assistant/message' || event.data.usage === undefined) continue
    const day = dayState(state, viewerDate(event.time, formatter))
    addUsage(day, event.data.usage)
    if (route === undefined) {
      addUsage(state.unattributed, event.data.usage)
      continue
    }
    addUsage(dayRouteState(day, route.provider, route.model), event.data.usage)
    addUsage(modelState(state, route.provider, route.model), event.data.usage)
  }
}

/** Finalize mutable report maps into deterministic wire arrays. */
function finalizeUsageReport(state: UsageReportState): UsageReport {
  return {
    days: [...state.days.values()].map(day => ({
      date: day.date,
      requests: day.requests,
      inputTokens: day.inputTokens,
      outputTokens: day.outputTokens,
      cacheReadTokens: day.cacheReadTokens,
      cacheWriteTokens: day.cacheWriteTokens,
      routes: [...day.routes.values()].sort(compareRoutes),
    })).sort((a, b) => a.date.localeCompare(b.date)),
    models: [...state.models.values()].sort(compareRoutes),
    unattributed: state.unattributed,
  }
}

/** Create empty mutable report state. */
function usageReportState(): UsageReportState {
  return { days: new Map(), models: new Map(), unattributed: emptyTotals() }
}

/**
 * Fold complete durable logs into one deterministic usage report.
 * @param logs - complete durable event sequences, one sequence per session.
 * @param timeZone - IANA viewer zone used to group daily totals.
 * @returns usage totals grouped by viewer calendar day and recorded model route.
 */
export function usageReportFromLogs(logs: readonly (readonly SessionEvent[])[], timeZone = 'UTC'): UsageReport {
  const state = usageReportState()
  const formatter = viewerDateFormatter(timeZone)
  for (const events of logs) foldUsageEvents(events, state, formatter)
  return finalizeUsageReport(state)
}

/**
 * Merge bounded per-session usage reports into one all-history report.
 * @param reports - independently folded session reports.
 * @returns the additive all-history report with each daily route retained.
 */
export function usageReportFromReports(reports: readonly UsageReport[]): UsageReport {
  const state = usageReportState()
  for (const report of reports) {
    for (const source of report.days) {
      const target = dayState(state, source.date)
      addTotals(target, source)
      for (const route of source.routes) addTotals(dayRouteState(target, route.provider, route.model), route)
    }
    for (const model of report.models) addTotals(modelState(state, model.provider, model.model), model)
    addTotals(state.unattributed, report.unattributed)
  }
  return finalizeUsageReport(state)
}

/** Return whether the runtime can use a browser-supplied IANA time zone. */
function supportedTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

/** Domain constraints of the usage-report.read request beyond the generated string codec. */
const usageReportReadRequestSchema = z.object({
  timeZone: z.string().max(128).refine(supportedTimeZone),
})

/** One cached all-history report for one viewer calendar zone. */
interface CachedUsageReport {
  readonly report: UsageReport
  readonly epoch: number
  readonly durableFingerprint: string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the all-history `usage-report` Remote namespace. */
    usageReportController: UsageReportController
  }
}

/**
 * Host service backing the generated `ctx.remote['usage-report']` namespace.
 * Every read stays cold: it folds the logical session corpus through the
 * Session query seam and never activates an Agent. Completed response usage
 * observed live, and every stored-log revision, invalidate the per-zone cache
 * without retaining a report that raced either change.
 */
export class UsageReportController extends TypertRemoteService {
  static inject = ['sessionQuery', 'typert']

  private readonly reports = new Map<string, CachedUsageReport>()
  private epoch = 0

  /** @param ctx - Host context carrying the Session query seam and optional persistence. */
  constructor(ctx: Context) {
    super(ctx, 'usageReportController', { namespace: 'usage-report' })
    ctx.on('session/event', (_session, event) => {
      if (event.type === 'assistant/message' && event.data.usage !== undefined) this.epoch += 1
    })
  }

  /**
   * Reconstruct per-request model metrics from the durable session logs.
   * @param request - viewer calendar zone for the daily buckets.
   * @param signal - caller cancellation for corpus listing and durable reads.
   * @returns usage totals grouped by viewer calendar day and recorded model route.
   * @throws RemoteError when the zone is unsupported, the read is cancelled, or the corpus cannot be folded.
   */
  @Remote
  async read(request: UsageReportReadRequest, signal: AbortSignal): Promise<UsageReport> {
    const parsed = usageReportReadRequestSchema.safeParse(request)
    if (!parsed.success) {
      throw new RemoteError('gateway/bad-request', 'invalid payload for usage-report.read', { issues: parsed.error.issues })
    }
    const timeZone = new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timeZone }).resolvedOptions().timeZone
    try {
      signal.throwIfAborted()
      return await this.readReport(timeZone, signal)
    } catch (error: unknown) {
      if (signal.aborted) throw new RemoteError('gateway/cancelled', 'usage report read was cancelled', {}, { cause: error })
      throw new RemoteError(
        'gateway/internal',
        `usage report unavailable: ${error instanceof Error ? error.message : String(error)}`,
        {},
        { cause: error },
      )
    }
  }

  /** Rebuild only when live or durable inputs change; never retain a report that races either change. */
  private async readReport(timeZone: string, signal: AbortSignal): Promise<UsageReport> {
    const beforeEpoch = this.epoch
    const beforeFingerprint = await this.durableFingerprint(signal)
    const cached = this.reports.get(timeZone)
    if (cached?.epoch === beforeEpoch && cached.durableFingerprint === beforeFingerprint) return cached.report
    const records = await this.ctx.sessionQuery.listSessions(signal)
    const settlements = await this.ctx.sessionQuery.projectSessions(
      records.map(record => record.header.id),
      source => usageReportFromLogs([source.events], timeZone),
      signal,
    )
    const failure = settlements.find(settlement => settlement.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    const report = usageReportFromReports(settlements.map((settlement) => {
      if (settlement.status !== 'fulfilled') throw new Error('unreachable usage report settlement')
      return settlement.value
    }))
    const afterFingerprint = await this.durableFingerprint(signal)
    if (this.epoch === beforeEpoch && afterFingerprint === beforeFingerprint) {
      this.reports.set(timeZone, { report, epoch: beforeEpoch, durableFingerprint: beforeFingerprint })
    }
    return report
  }

  /** Observe stored-log revisions without loading their event histories. */
  private async durableFingerprint(signal: AbortSignal): Promise<string | undefined> {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return undefined
    const snapshots = await persistence.list({ signal })
    return snapshots
      .map(snapshot => JSON.stringify([snapshot.header.id, snapshot.revision]))
      .toSorted()
      .join('\n')
  }
}

export default UsageReportController
