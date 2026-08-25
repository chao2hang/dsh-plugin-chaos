/** Real per-request usage report reconstructed from durable session events. */

import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Token totals for a collection of completed provider requests. */
export interface UsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Real provider usage observed for one route on one viewer calendar day. */
export interface UsageReportDayRoute extends UsageTotals {
  provider: string
  model: string
}

/** Real provider usage observed on one viewer calendar day. */
export interface UsageReportDay extends UsageTotals {
  date: string
  routes: UsageReportDayRoute[]
}

/** Real provider usage grouped by the route recorded before each request. */
export interface UsageReportModel extends UsageTotals {
  provider: string
  model: string
}

/** Historical usage reconstructed from all readable durable session logs. */
export interface UsageReport {
  days: UsageReportDay[]
  models: UsageReportModel[]
  unattributed: UsageTotals
}

/** Viewer calendar zone used to group completed requests by date. */
export interface UsageReportReadRequest {
  timeZone: string
}

/** Read-only all-history usage-report endpoint. */
export interface UsageReportApi {
  /**
   * Reconstruct per-request time and model metrics from raw session logs.
   * @param request - viewer calendar zone for daily buckets.
   * @param signal - optional cancellation for corpus listing and durable reads.
   * @returns real report buckets or a domain error.
   */
  read(request: RpcRequest<UsageReportReadRequest>, signal?: AbortSignal): Promise<RpcResponse<UsageReport>>
}

interface UsageReportDayState extends UsageTotals {
  date: string
  routes: Map<string, UsageReportDayRoute>
}

interface UsageReportState {
  days: Map<string, UsageReportDayState>
  models: Map<string, UsageReportModel>
  unattributed: UsageTotals
}

/** Zero-valued request accounting. */
function emptyTotals(): UsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

/** Add one provider-reported response usage record. */
function addUsage(totals: UsageTotals, usage: NonNullable<Extract<SessionEvent, { type: 'assistant/message' }>['data']['usage']>): void {
  totals.requests += 1
  totals.inputTokens += usage.inputTokens
  totals.outputTokens += usage.outputTokens
  totals.cacheReadTokens += usage.cacheReadTokens ?? 0
  totals.cacheWriteTokens += usage.cacheWriteTokens ?? 0
}

/** Add one aggregate's counters to another. */
function addTotals(target: UsageTotals, source: UsageTotals): void {
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
function dayRouteState(day: UsageReportDayState, provider: string, model: string): UsageReportDayRoute {
  const key = routeKey(provider, model)
  let route = day.routes.get(key)
  if (route === undefined) {
    route = { provider, model, ...emptyTotals() }
    day.routes.set(key, route)
  }
  return route
}

/** Return the mutable all-history route state. */
function modelState(state: UsageReportState, provider: string, model: string): UsageReportModel {
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
