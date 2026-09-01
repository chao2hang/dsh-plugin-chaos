/**
 * RetryDock: the retry strip docked above the message composer
 * (conversation.input.dock). Rendered only when the conversation's last node
 * is a terminal failure, an interrupted assistant prefix, or an output-token
 * cap notice and nothing is running, queued, or awaiting a decision; every
 * other state renders nothing. The button resends the conversation's last user
 * message through the public input actions — the same path the composer's send
 * button takes, so admission, serialization, and notices stay owned by the
 * input machine.
 */

import { useCallback, useMemo } from 'react'
import { IconRefreshOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AbnormalEnd } from './retry-model.ts'
import { detectAbnormalEnd, lastUserTextOf } from './retry-model.ts'
import type { RetryKey } from './locales.ts'
import css from './RetryDock.module.css'

/** Label key per abnormal end kind. */
const END_LABELS = {
  error: 'end.error',
  interrupted: 'end.interrupted',
  'max-tokens': 'end.maxTokens',
  crashed: 'end.crashed',
} as const satisfies Record<AbnormalEnd['kind'], RetryKey>

/** Presentational strip props: everything already derived by {@link RetryDock}. */
export interface RetryStripProps {
  /** The abnormal ending the strip reports. */
  end: AbnormalEnd
  /** The resentable text of the last user message (non-empty by contract). */
  onRetry: () => void
  /** The injected translate seat. */
  t: (key: RetryKey) => string
}

/**
 * The strip itself: glyph, terminal-state label, optional failure detail, and
 * the resend button.
 * @param props - derived state and the retry verb.
 * @returns the strip element.
 */
export function RetryStrip({ end, onRetry, t }: RetryStripProps) {
  return (
    <div className={css.dock} data-chaos-retry>
      <div className={css.bar} title={end.message}>
        <span className={css.glyph}><IconRefreshOutline16 size={14} /></span>
        <span className={css.label}>{t(END_LABELS[end.kind])}</span>
        {end.message !== undefined && <span className={css.detail}>{end.message}</span>}
        <Tooltip label={t('action.retryAria')} side="bottom" delayMs={500}>
          <button type="button" className={css.retryBtn} onClick={onRetry} aria-label={t('action.retryAria')}>
            <IconRefreshOutline16 size={14} />
            <span>{t('action.retry')}</span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/** Full props of the dock entry: InputZone owner share + session standard kit + the locale seat. */
export type RetryDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'chaos-retry'>

/**
 * The registered dock entry. Reads the Session lifecycle, the Chat target, and
 * the Session's effective pending interaction through the standard seats, so
 * the derivation stays current on every relevant change without effects.
 * @param props - the standard seats (session, chat, pending interaction), the
 * public input actions, and the injected translate seat.
 * @returns the strip, or null when the conversation did not end abnormally or
 * carries no resentable user text.
 */
export function RetryDock({ useSession, useChat, useSessionPendingInteraction, sessionId, inputActions, t }: RetryDockProps) {
  const session = useSession(snapshot => snapshot)
  const chat = useChat(snapshot => snapshot)
  const pendingInteraction = useSessionPendingInteraction(snapshot => snapshot.get(sessionId))
  const end = detectAbnormalEnd({ session, chat, pendingInteraction })
  // Memo keeps the resendable text stable while unrelated snapshot fields
  // change, so the callback below does not churn.
  const retryText = useMemo(() => lastUserTextOf(chat.legacy.nodes), [chat.legacy.nodes])

  const onRetry = useCallback(() => {
    if (retryText === null) return
    inputActions.setDraft(retryText)
    inputActions.submit()
  }, [inputActions, retryText])

  if (end === null || retryText === null) return null
  return <RetryStrip end={end} onRetry={onRetry} t={t} />
}
