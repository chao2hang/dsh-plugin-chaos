/** Dedicated session statistics view for the conversation tab ring. */

import { useMemo } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the sessionStats and tokenUsage keys into SessionProjectionMap.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { billedInputTokens, cacheHitPercent, deriveStats, formatDuration } from './StatsLine.tsx'
import { formatTokens } from './token-format.ts'
import css from './StatsView.module.css'

/** Props supplied by the conversation view slot and its locale boundary. */
export type StatsViewProps = ConvViewProps & PropsLocale<'chat'>

/**
 * Aggregate every loaded session projection without synthesizing unknown data.
 * @param list - the sessions-list snapshot with host projection values.
 * @returns whole-history counters summed over non-blank sessions.
 */
export function aggregateConversationStats(list: SessionListState) {
  let sessions = 0
  let turns = 0
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let uncachedInputTokens = 0
  for (const id of list.ids) {
    const summary = list.byId[id]
    if (summary === undefined || summary.blank) continue
    sessions += 1
    const stats = summary.projectionValues?.sessionStats
    if (stats !== undefined) {
      turns += stats.turns
      steps += stats.steps
      llmMs += stats.llmMs
      toolMs += stats.toolMs
    }
    const usage = summary.projectionValues?.tokenUsage
    if (usage !== undefined) {
      uncachedInputTokens += usage.uncachedInputTokens
      cacheReadTokens += usage.cacheReadTokens
      cacheWriteTokens += usage.cacheWriteTokens
      inputTokens += billedInputTokens(usage)
      outputTokens += usage.outputTokens
    }
  }
  return { sessions, turns, steps, llmMs, toolMs, inputTokens, outputTokens, uncachedInputTokens, cacheReadTokens, cacheWriteTokens }
}

/** Render session and loaded-conversation summaries beside Chat and Trajectory. */
export function StatsView({ useChat, useProjection, useSessions, t }: StatsViewProps) {
  const nodes = useChat(snapshot => snapshot.legacy.nodes)
  const projected = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const stats = useMemo(() => projected ?? deriveStats(nodes), [nodes, projected])
  const allConversations = useSessions(aggregateConversationStats)
  const cards = [
    { label: t('stats.turns'), value: String(stats.turns) },
    { label: t('stats.steps'), value: String(stats.steps) },
    { label: t('stats.llmTotal'), value: stats.llmMs > 0 ? formatDuration(stats.llmMs, t) : '—' },
    { label: t('stats.toolTotal'), value: stats.toolMs > 0 ? formatDuration(stats.toolMs, t) : '—' },
    { label: t('stats.inputTokens'), value: usage === undefined ? '—' : formatTokens(billedInputTokens(usage), t) },
    { label: t('stats.outputTokens'), value: usage === undefined ? '—' : formatTokens(usage.outputTokens, t) },
  ]
  const cacheHit = usage === undefined ? null : cacheHitPercent(usage)
  return (
    <section className={css.root} aria-label={t('view.statistics')} data-statistics-view>
      <h2 className={css.title}>{t('view.statistics')}</h2>
      <div className={css.grid}>
        {cards.map(card => (
          <div key={card.label} className={css.card}>
            <span className={css.label}>{card.label}</span>
            <strong className={css.value}>{card.value}</strong>
          </div>
        ))}
        <div className={css.card}>
          <span className={css.label}>{t('stats.cacheHitLabel')}</span>
          <strong className={css.value}>{cacheHit === null ? '—' : `${cacheHit}%`}</strong>
        </div>
      </div>
      <section className={css.summary} aria-label={t('stats.allConversations')}>
        <h3 className={css.subtitle}>{t('stats.allConversations')}</h3>
        <div className={css.grid}>
          <div className={css.card}><span className={css.label}>{t('stats.sessions')}</span><strong className={css.value}>{allConversations.sessions}</strong></div>
          <div className={css.card}><span className={css.label}>{t('stats.turns')}</span><strong className={css.value}>{allConversations.turns}</strong></div>
          <div className={css.card}><span className={css.label}>{t('stats.totalTokens')}</span><strong className={css.value}>{formatTokens(allConversations.inputTokens + allConversations.outputTokens, t)}</strong></div>
          <div className={css.card}><span className={css.label}>{t('stats.llmTotal')}</span><strong className={css.value}>{allConversations.llmMs > 0 ? formatDuration(allConversations.llmMs, t) : '—'}</strong></div>
        </div>
      </section>
    </section>
  )
}
