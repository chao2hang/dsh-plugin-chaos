/**
 * The System settings section: server restart with a confirmation step and a
 * live reconnection wait.
 *
 * Restart replaces the process, not the data: sessions live in the durable
 * session log, and the persistence layer closes a turn the exit cut short with
 * its own crash-recovery marker on reload. What the operator loses is the
 * in-flight turn — hence the confirmation copy names it, and the section warns
 * separately when a turn is actually running.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, IconLoadingOutline16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { RestartPort } from './restart-port.ts'
import css from './RestartSection.module.css'

/** Injected face of the section: the host port plus the live activity read. */
export interface RestartSectionInjected {
  /** Host routes for capability and restart. */
  port: RestartPort
  /** Whether any session is mid-turn right now (drives the extra warning). */
  busySessions: () => number
}

/** Section lifecycle: what the operator is looking at. */
type Phase = 'idle' | 'confirming' | 'restarting'

/** Full props: the section owner share, the injected face, and the locale seat. */
export type RestartSectionProps =
  PropsRuntime<'settings.section'> & InjectFace<RestartSectionInjected> & PropsLocale<'chaos-restart'>

/**
 * Render the System section.
 * @param props - owner share, injected host port, and translate seat.
 * @returns the section element, or the unsupported notice when the launcher
 * cannot spawn a successor.
 */
export function RestartSection({ port, busySessions, t }: RestartSectionProps) {
  const [supported, setSupported] = useState<boolean | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void port.status()
      .then((status) => { if (live) setSupported(status.canRestart) })
      .catch(() => { if (live) setSupported(false) })
    return () => { live = false }
  }, [port])

  const onConfirm = useCallback(async () => {
    setError(null)
    setPhase('restarting')
    const ack = await port.restart().catch((thrown: unknown) => ({
      ok: false as const,
      reason: thrown instanceof Error ? thrown.message : String(thrown),
    }))
    if (ack.ok) {
      // The host answers before it exits, so there is nothing further to await
      // here: the connection layer owns the reconnect and the page recovers on
      // its own. The phase stays 'restarting' as the visible wait.
      return
    }
    setPhase('idle')
    setError(ack.reason)
  }, [port])

  if (supported === undefined) return <div className={css.section} />
  if (!supported) {
    return (
      <div className={css.section}>
        <p className={css.unsupported}>{t('unsupported')}</p>
      </div>
    )
  }

  const busy = busySessions()
  return (
    <div className={css.section}>
      <div className={css.row}>
        <div className={css.copy}>
          <span className={css.title}>{t('title')}</span>
          <span className={css.description}>{t('description')}</span>
        </div>
        {phase === 'idle' && (
          <Button
            variant="outline"
            size="sm"
            icon={<IconRefreshOutline16 size={16} />}
            onClick={() => { setPhase('confirming') }}
          >
            {t('action.restart')}
          </Button>
        )}
        {phase === 'restarting' && (
          <span className={css.waiting} role="status">
            <IconLoadingOutline16 size={16} />
            {t('status.restarting')}
          </span>
        )}
      </div>

      {phase === 'confirming' && (
        <div className={css.confirm} role="alertdialog" aria-label={t('confirm.title')}>
          <p className={css.confirmTitle}>{t('confirm.title')}</p>
          <p className={css.confirmBody}>{t('confirm.body')}</p>
          {busy > 0 && <p className={css.confirmBusy}>{t('confirm.busy', { count: busy })}</p>}
          <div className={css.confirmActions}>
            <Button variant="ghost" size="sm" onClick={() => { setPhase('idle') }}>
              {t('action.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => { void onConfirm() }}>
              {t('action.confirm')}
            </Button>
          </div>
        </div>
      )}

      {error !== null && <p className={css.error} role="alert">{t('error', { reason: error })}</p>}
    </div>
  )
}
