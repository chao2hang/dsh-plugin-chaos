/**
 * The transcript row for a turn crash recovery closed: a quiet inline notice
 * marking where the process died, so the gap between the last recorded event
 * and the next turn is explained rather than silent.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TurnInterruptedNodeView.module.css'

/** Full props of the keyed chat-node entry plus the locale seat. */
export type TurnInterruptedNodeViewProps =
  PropsRuntime<'conversation.chat.node', 'turn-interrupted'> & PropsLocale<'chaos-retry'>

/**
 * Render the crash-recovery notice.
 * @param props - the keyed node share and the translate seat.
 * @returns the notice row.
 */
export function TurnInterruptedNodeView({ t }: TurnInterruptedNodeViewProps) {
  return (
    <div className={css.notice} role="note">
      <span className={css.rule} aria-hidden="true" />
      <span className={css.text}>{t('node.interrupted')}</span>
      <span className={css.rule} aria-hidden="true" />
    </div>
  )
}
