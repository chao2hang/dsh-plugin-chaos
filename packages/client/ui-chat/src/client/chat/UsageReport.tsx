/** Usage report charts backed by durable per-request host accounting. */

import { useEffect, useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { formatTokens } from './token-format.ts'
import css from './UsageReport.module.css'

/** Token counters returned by the durable usage report. */
interface UsageTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Model-attributed counters inside one viewer calendar day. */
interface UsageReportDayRoute extends UsageTotals {
  provider: string
  model: string
}

/** Durable all-history usage report value served by the host endpoint. */
export interface UsageReportData {
  days: (UsageTotals & { date: string; routes: UsageReportDayRoute[] })[]
  models: (UsageTotals & { provider: string; model: string })[]
  unattributed: UsageTotals
}

/** One result of a usage-report read: the report or a transport/RPC failure. */
export type UsageReportResult =
  | { ok: true; value: UsageReportData }
  | { ok: false; error: unknown }

/** Durable usage report endpoint served by the host `/api` gateway. */
export interface UsageReportRead {
  /**
   * Read completed-request history for one viewer calendar zone.
   * @param payload - the viewer's IANA calendar zone.
   * @param signal - aborts an in-flight read.
   * @returns the endpoint result in the client transport envelope.
   */
  read: (payload: { timeZone: string }, signal?: AbortSignal) => Promise<{ result: UsageReportResult }>
}

/** Props supplied by the Statistics tab and its client API transport. */
export type UsageReportProps = ConvViewProps & PropsLocale<'chat'> & {
  /** Absent while the assembly has no usage-report contribution. */
  usageReport?: UsageReportRead | undefined
}

/** One real daily usage bucket returned by the host report endpoint. */
export interface UsageDay { date: string; requests: number; tokens: number }

/** One visible segment in a stacked daily token bar. */
export interface UsageTrendSegment { provider: string | null; model: string | null; tokens: number }

/** One calendar day presented in the 30-day usage chart. */
export interface UsageTrendDay extends UsageDay { segments: readonly UsageTrendSegment[] }

const RECENT_DAY_COUNT = 30
const REPORT_REFRESH_MS = 30_000
const SEGMENT_COLORS = [
  'var(--dsw-alias-state-business-primary)',
  'var(--dsw-alias-state-success-primary)',
  'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-state-error-secondary)',
  'var(--dsw-alias-brand-primary-new-colorprimary-new-color)',
]
const UNATTRIBUTED_COLOR = 'var(--dsw-alias-fg-muted)'

interface CachedUsageReport { report: UsageReportData; updatedAt: number }
/** Reuse the last report for one connected endpoint while a tab-mount refresh is in flight. */
const usageReportCache = new WeakMap<UsageReportRead, Map<string, CachedUsageReport>>()

function cachedUsageReport(endpoint: UsageReportRead | undefined, timeZone: string): CachedUsageReport | undefined {
  return endpoint === undefined ? undefined : usageReportCache.get(endpoint)?.get(timeZone)
}

function cacheUsageReport(endpoint: UsageReportRead, timeZone: string, report: UsageReportData, updatedAt: number): void {
  let reports = usageReportCache.get(endpoint)
  if (reports === undefined) usageReportCache.set(endpoint, reports = new Map<string, CachedUsageReport>())
  reports.set(timeZone, { report, updatedAt })
}

/** Return all tokens charged to one completed request aggregate. */
function totalTokens(totals: UsageTotals): number {
  return totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens
}

/** Convert server daily buckets into total-token chart values. */
export function usageDays(report: UsageReportData): readonly UsageDay[] {
  return report.days.map(day => ({ date: day.date, requests: day.requests, tokens: totalTokens(day) }))
}

/** Return the viewer-local date string for one calendar timestamp. */
function localDate(time: number): string {
  const date = new Date(time)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

/** Return the viewer's IANA calendar zone, falling back to UTC when unavailable. */
function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Return the delay until the next viewer-local calendar-day boundary. */
export function msUntilNextLocalMidnight(now = Date.now()): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now
}

/** Format a successful report refresh timestamp in the viewer's local time. */
function localTime(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Build the most recent 30 viewer-local calendar days, preserving zero-use dates. */
export function usageTrendDays(report: UsageReportData, now = new Date()): readonly UsageTrendDay[] {
  const byDate = new Map(report.days.map(day => [day.date, day]))
  return Array.from({ length: RECENT_DAY_COUNT }, (_, index) => {
    const date = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (RECENT_DAY_COUNT - 1 - index)).getTime())
    const day = byDate.get(date)
    if (day === undefined) return { date, requests: 0, tokens: 0, segments: [] }
    const attributed = day.routes.reduce((total, route) => total + totalTokens(route), 0)
    const remainder = Math.max(0, totalTokens(day) - attributed)
    return {
      date,
      requests: day.requests,
      tokens: totalTokens(day),
      segments: [
        ...day.routes.map(route => ({ provider: route.provider, model: route.model, tokens: totalTokens(route) })),
        ...(remainder === 0 ? [] : [{ provider: null, model: null, tokens: remainder }]),
      ],
    }
  })
}

/** Stable identity for a model or an unattributed segment. */
function segmentKey(segment: UsageTrendSegment): string {
  return segment.provider === null || segment.model === null
    ? 'unattributed'
    : segment.provider + '/' + segment.model
}

/** Readable label for a model or an unattributed segment. */
function segmentLabel(segment: UsageTrendSegment, unattributed: string): string {
  return segment.provider === null || segment.model === null
    ? unattributed
    : segment.provider + ' / ' + segment.model
}

/** Render all-history usage based on real completed provider requests. */
export function UsageReport({ usageReport, t }: UsageReportProps) {
  const timeZone = viewerTimeZone()
  const cached = cachedUsageReport(usageReport, timeZone)
  const [report, setReport] = useState<UsageReportData | null>(() => cached?.report ?? null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(() => cached === undefined ? 'loading' : 'ready')
  const [revision, setRevision] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => cached?.updatedAt ?? null)
  useEffect(() => {
    const controller = new AbortController()
    const cached = cachedUsageReport(usageReport, timeZone)
    if (cached === undefined) {
      setReport(null)
      setUpdatedAt(null)
      setState('loading')
    } else {
      setReport(cached.report)
      setUpdatedAt(cached.updatedAt)
      setState('ready')
    }
    if (usageReport === undefined) {
      setState('error')
      return () => { controller.abort() }
    }
    void usageReport.read({ timeZone }, controller.signal).then(
      (response) => {
        if (controller.signal.aborted) return
        if (response.result.ok) {
          const updatedAt = Date.now()
          cacheUsageReport(usageReport, timeZone, response.result.value, updatedAt)
          setReport(response.result.value)
          setUpdatedAt(updatedAt)
          setState('ready')
        } else {
          setState(current => current === 'ready' ? current : 'error')
        }
      },
      () => { if (!controller.signal.aborted) setState(current => current === 'ready' ? current : 'error') },
    )
    return () => { controller.abort() }
  }, [revision, timeZone, usageReport])

  useEffect(() => {
    if (usageReport === undefined) return
    let midnightTimer: ReturnType<typeof setTimeout>
    const refresh = (): void => { setRevision(value => value + 1) }
    const refreshIfVisible = (): void => { if (!document.hidden) refresh() }
    const armMidnight = (): void => {
      midnightTimer = setTimeout(() => {
        refreshIfVisible()
        armMidnight()
      }, msUntilNextLocalMidnight())
    }
    const interval = setInterval(refreshIfVisible, REPORT_REFRESH_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    armMidnight()
    return () => {
      clearInterval(interval)
      clearTimeout(midnightTimer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [usageReport])

  const trendDays = useMemo(() => report === null ? [] : usageTrendDays(report), [report])
  const activeDays = trendDays.filter(day => day.requests > 0).length
  const selectedDay = trendDays.find(day => day.date === selectedDate)
    ?? [...trendDays].reverse().find(day => day.tokens > 0)
    ?? trendDays.at(-1)
  const peakTokens = Math.max(1, ...trendDays.map(day => day.tokens))
  const legend = useMemo(() => {
    const entries = new Map<string, UsageTrendSegment>()
    for (const day of trendDays) for (const segment of day.segments) entries.set(segmentKey(segment), segment)
    return [...entries.values()]
  }, [trendDays])
  const colors = useMemo(() => new Map(legend.map((segment, index) => [
    segmentKey(segment),
    segment.provider === null ? UNATTRIBUTED_COLOR : SEGMENT_COLORS[index % SEGMENT_COLORS.length],
  ])), [legend])
  const totals = report === null ? null : report.days.reduce((sum, day) => ({
    requests: sum.requests + day.requests,
    inputTokens: sum.inputTokens + day.inputTokens,
    outputTokens: sum.outputTokens + day.outputTokens,
    cacheReadTokens: sum.cacheReadTokens + day.cacheReadTokens,
    cacheWriteTokens: sum.cacheWriteTokens + day.cacheWriteTokens,
  }), { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  const cards = totals === null ? [] : [
    { label: t('report.totalTokens'), value: formatTokens(totalTokens(totals), t) },
    { label: t('report.inputTokens'), value: formatTokens(totals.inputTokens + totals.cacheReadTokens + totals.cacheWriteTokens, t) },
    { label: t('report.outputTokens'), value: formatTokens(totals.outputTokens, t) },
    { label: t('report.requests'), value: String(totals.requests) },
    { label: t('report.models'), value: String(report?.models.length ?? 0) },
  ]

  return (
    <section className={css.root} aria-label={t('report.title')} data-usage-report>
      <header className={css.header}>
        <h2>{t('report.title')}</h2>
        <div className={css.headerMeta}>
          <p>{t('report.scope')}</p>
          {updatedAt !== null && <div className={css.refreshStatus}><span>{t('report.updatedAt', { time: localTime(updatedAt) })}</span><button type="button" onClick={() => { setRevision(value => value + 1) }}>{t('report.refresh')}</button></div>}
        </div>
      </header>
      {state === 'loading' && <div className={css.loadingReport} role="status" aria-live="polite">
        <p className={css.loading}><span className={css.loadingSpinner} aria-hidden="true" />{t('report.loading')}</p>
        <div className={css.loadingSummary} aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} data-loading-metric />)}</div>
        <div className={css.loadingPanel} aria-hidden="true"><span /><div>{Array.from({ length: 12 }, (_, index) => <i key={index} data-loading-bar style={{ height: String(18 + (index % 5) * 15) + '%' }} />)}</div></div>
      </div>}
      {state === 'error' && <div className={css.error} role="alert"><p>{t('report.failed')}</p><button type="button" onClick={() => { setRevision(value => value + 1) }}>{t('report.retry')}</button></div>}
      {state === 'ready' && report !== null && totals !== null && totals.requests === 0 && <p className={css.empty}>{t('report.empty')}</p>}
      {state === 'ready' && report !== null && totals !== null && totals.requests > 0 && <>
        <section className={css.summary} aria-label={t('report.summary')}>
          {cards.map(card => <div className={css.metric} key={card.label}><strong>{card.value}</strong><span>{card.label}</span></div>)}
        </section>
        <section className={css.panel} aria-label={t('report.activity')}>
          <div className={css.panelHeader}><h3>{t('report.activity')}</h3><p>{t('report.activityDescription', { days: activeDays })}</p></div>
          <div className={css.activity} aria-label={t('report.activity')}>
            {trendDays.map(day => <span key={day.date} data-level={day.tokens === 0 ? 0 : Math.min(4, Math.ceil(day.tokens / peakTokens * 4))} data-zero={day.tokens === 0 || undefined} title={day.date + ': ' + formatTokens(day.tokens, t)} />)}
          </div>
        </section>
        <section className={css.panel} aria-label={t('report.trend')}>
          <div className={css.panelHeader}><h3>{t('report.trend')}</h3><p>{t('report.trendDescription')}</p></div>
          <div className={css.chartMeta}><p>{t('report.chartHint')}</p><span>{t('report.dateRange', { start: trendDays[0]?.date, end: trendDays.at(-1)?.date })}</span></div>
          <div className={css.chart} role="group" aria-label={t('report.trend')}>
            {trendDays.map(day => <button
              className={css.bar}
              type="button"
              key={day.date}
              data-date={day.date}
              data-zero={day.tokens === 0 || undefined}
              aria-pressed={selectedDay?.date === day.date}
              aria-label={t('report.daySummary', { date: day.date, tokens: formatTokens(day.tokens, t), requests: day.requests })}
              onClick={() => { setSelectedDate(day.date) }}
              onMouseEnter={() => { setSelectedDate(day.date) }}
              onFocus={() => { setSelectedDate(day.date) }}
            >
              <span className={css.barTrack}>
                {day.tokens === 0
                  ? <span className={css.zeroBar} />
                  : <span className={css.barFill} style={{ height: String(Math.max(3, day.tokens / peakTokens * 100)) + '%' }}>
                    {day.segments.map(segment => <span
                      className={css.segment}
                      data-model={segmentKey(segment)}
                      key={segmentKey(segment)}
                      style={{ flexGrow: segment.tokens, backgroundColor: colors.get(segmentKey(segment)) }}
                    />)}
                  </span>}
              </span>
            </button>)}
          </div>
          <div className={css.chartRange} aria-hidden="true"><span>{trendDays[0]?.date}</span><span>{trendDays.at(-1)?.date}</span></div>
          {selectedDay !== undefined && <div className={css.dayDetail} aria-live="polite">
            <div><span>{t('report.selectedDay')}</span><strong>{selectedDay.date}</strong></div>
            <div><strong>{formatTokens(selectedDay.tokens, t)}</strong><span>{t('report.totalTokens')} · {selectedDay.requests} {t('report.requests')}</span></div>
            <div className={css.daySegments}>
              {selectedDay.tokens === 0
                ? <span className={css.noUsage}>{t('report.noUsage')}</span>
                : selectedDay.segments.map(segment => <span className={css.legendItem} key={segmentKey(segment)}><i style={{ backgroundColor: colors.get(segmentKey(segment)) }} />{segmentLabel(segment, t('report.unattributed'))} · {formatTokens(segment.tokens, t)}</span>)}
            </div>
          </div>}
          {legend.length > 0 && <div className={css.legend} aria-label={t('report.models')}>
            {legend.map(segment => <span className={css.legendItem} key={segmentKey(segment)}><i style={{ backgroundColor: colors.get(segmentKey(segment)) }} />{segmentLabel(segment, t('report.unattributed'))}</span>)}
          </div>}
        </section>
        <section className={css.panel} aria-label={t('report.models')}>
          <h3>{t('report.models')}</h3>
          <div className={css.models}>
            {report.models.map(model => <div key={model.provider + '/' + model.model}><strong>{model.provider} / {model.model}</strong><span>{formatTokens(totalTokens(model), t)} · {model.requests} {t('report.requests')}</span></div>)}
            {report.unattributed.requests > 0 && <div><strong>{t('report.unattributed')}</strong><span>{formatTokens(totalTokens(report.unattributed), t)} · {report.unattributed.requests} {t('report.requests')}</span></div>}
          </div>
        </section>
      </>}
    </section>
  )
}
