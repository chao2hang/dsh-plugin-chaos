/**
 * Retention sweeper for archived sessions, Host half. On an interval the
 * plugin deletes every archived session whose jsonl session log has been
 * quiet past `maxArchivedDays` (0 disables the sweeper). Deletion removes the
 * session's own directory under the sessions root; the workspace registry's
 * archived set is read, never rewritten, and the registry already filters
 * sessions whose logs disappear.
 *
 * The browser half does not exist: this package ships no `dsh.client`
 * declaration and renders no UI.
 *
 * @module @deepseek-ai/dsh-plugin-chaos-janitor
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/cordis-plugin-timer'
import { sweepArchivedSessions } from './sweep.ts'

/** Default sweep cadence (minutes). */
export const DEFAULT_INTERVAL_MINUTES = 60

/** Stable Cordis plugin name. */
export const name = 'chaos-janitor'

/** Required services: the archive set, session headers, and the live-session store. */
export const inject = ['workspaceRegistry', 'sessionPersistence', 'sessions', 'timer']

/** Plugin configuration. */
export interface Config {
  /** Age in days beyond which an archived session's log is deleted; 0 (default) disables the sweeper. */
  maxArchivedDays?: number
  /** Sweep cadence in minutes. */
  intervalMinutes?: number
  /** Rehearsal switch: log the deletions a sweep would perform without deleting. */
  dryRun?: boolean
}

export const Config: z<Config> = z.object({
  maxArchivedDays: z.natural().default(0),
  intervalMinutes: z.natural().min(1).default(DEFAULT_INTERVAL_MINUTES),
  dryRun: z.boolean().default(false),
})

/**
 * Mount the retention sweeper.
 * @param ctx - plugin context; the timer rides this fiber.
 * @param config - validated plugin configuration (schema defaults applied).
 */
export function apply(ctx: Context, config: Config = {}): void {
  const maxArchivedDays = config.maxArchivedDays ?? 0
  const intervalMinutes = config.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES
  const dryRun = config.dryRun ?? false
  if (!Number.isSafeInteger(maxArchivedDays) || maxArchivedDays < 0) {
    throw new Error('chaos-janitor: maxArchivedDays must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error('chaos-janitor: intervalMinutes must be a positive safe integer')
  }
  if (maxArchivedDays === 0) {
    ctx.logger.info('chaos-janitor: retention disabled (maxArchivedDays is 0)')
    return
  }
  const root = dshHomePath('sessions')
  const run = async (): Promise<void> => {
    const snapshots = await ctx.sessionPersistence.list().catch((error: unknown) => {
      ctx.logger.warn(`chaos-janitor: sweep skipped: session listing failed: ${String(error)}`)
      return [] as readonly import('@deepseek-ai/dsh-session-persistence').SessionPersistenceSnapshot[]
    })
    const headers = snapshots.map(snapshot => snapshot.header)
    const outcome = await sweepArchivedSessions(
      {
        archived: new Set(ctx.workspaceRegistry.archivedSessionIds),
        headers,
        isLive: id => ctx.sessions.get(id as never) !== undefined,
      },
      { root, maxArchivedDays, dryRun, now: Date.now },
    )
    for (const deletion of outcome.deleted) {
      ctx.logger.info(
        `chaos-janitor: ${dryRun ? '[dry-run] ' : ''}deleted archived session ${deletion.id} (${deletion.ageDays}d quiet) at ${deletion.path}`,
      )
    }
    for (const skip of outcome.skipped) {
      ctx.logger.info(`chaos-janitor: kept archived session ${skip.id}: ${skip.reason}`)
    }
    for (const failure of outcome.failures) {
      ctx.logger.warn(`chaos-janitor: could not delete archived session ${failure.id}: ${failure.reason}`)
    }
  }
  const sweep = (): void => {
    void run().catch((error: unknown) => {
      ctx.logger.warn(`chaos-janitor: sweep failed: ${String(error)}`)
    })
  }
  ctx.interval(sweep, intervalMinutes * 60_000)
  // The boot pass runs promptly so a long-lived process does not wait a full
  // interval for its first cleanup.
  ctx.timeout(sweep, 5_000)
}
