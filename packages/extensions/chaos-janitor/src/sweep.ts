/**
 * Pure retention sweep for archived sessions. One pass receives the archived
 * id set, the persisted session headers, and a liveness probe, then deletes
 * the session directory of every archived session whose log file has been
 * quiet past the configured age. Paths come from the jsonl persistence
 * layout contract (`sessionDir` / `logPath`), never from a re-derived
 * encoding. A session is never deleted when it is live, when its log file is
 * unreadable, or when its directory holds anything but a known log file —
 * the sweep degrades to a skip instead of guessing.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { generationLogPath, sessionDir } from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { SessionHeader } from '@deepseek-ai/dsh-session'
import type { JanitorDeletion, JanitorFailure, JanitorOutcome, JanitorSkip } from './types.ts'

/** Log file basenames the jsonl persistence ever writes into a session dir. */
const KNOWN_LOG_NAMES: ReadonlySet<string> = new Set(['session.jsonl.zstd', 'session.jsonl'])
/** Version-tagged generation names (vN + suffix) the backend also commits. */
const GENERATION_LOG_PATTERN = /^session\.v\d+\.(zstd|jsonl)$/u

/** Fixed sweep inputs. */
export interface SweepOptions {
  /** Sessions root directory the jsonl backend is configured with. */
  readonly root: string
  /** Age in days beyond which an archived session's log is deleted; 0 disables the sweep. */
  readonly maxArchivedDays: number
  /** Rehearsal switch: report the deletions without performing them. */
  readonly dryRun: boolean
  /** Wall clock for age math (tests stub). */
  readonly now: () => number
}

/** Everything the sweep needs that the plugin entry supplies (tests stub). */
export interface SweepDeps {
  /** The registry-global archive set. */
  readonly archived: ReadonlySet<string>
  /** Headers of every materialized session. */
  readonly headers: readonly SessionHeader[]
  /** Whether one session id is live right now; live sessions are never deleted. */
  readonly isLive: (id: string) => boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Resolve the existing log file of one session directory, either compression.
 * @param root - sessions root directory.
 * @param header - the session's persisted header.
 * @returns the newest existing log path and its mtime, or undefined.
 */
async function existingLog(root: string, header: SessionHeader): Promise<{ path: string; mtimeMs: number } | undefined> {
  for (const compression of ['zstd', 'none'] as const) {
    const path = generationLogPath(root, header.cwd, header.id, header.version, compression)
    try {
      const info = await stat(path)
      return { path, mtimeMs: info.mtimeMs }
    } catch {
      // Try the other compression spelling; absence of both is reported by
      // the caller as a skip.
    }
  }
  return undefined
}

/**
 * Sweep the archived set once.
 * @param deps - archive set, headers, and the liveness probe.
 * @param options - root, retention age, dry-run, and clock.
 * @returns deletions, skips, and contained failures.
 */
export async function sweepArchivedSessions(deps: SweepDeps, options: SweepOptions): Promise<JanitorOutcome> {
  const deleted: JanitorDeletion[] = []
  const skipped: JanitorSkip[] = []
  const failures: JanitorFailure[] = []
  if (options.maxArchivedDays <= 0) return { deleted, skipped, failures }
  const cutoff = options.now() - options.maxArchivedDays * DAY_MS
  const byId = new Map(deps.headers.map(header => [header.id as string, header]))
  for (const id of deps.archived) {
    const header = byId.get(id)
    // No materialized header means no path knowledge: leave the session be.
    if (header === undefined) continue
    if (deps.isLive(id)) {
      skipped.push({ id, reason: 'live' })
      continue
    }
    const log = await existingLog(options.root, header)
    if (log === undefined) {
      skipped.push({ id, reason: 'log-missing' })
      continue
    }
    if (log.mtimeMs > cutoff) {
      skipped.push({ id, reason: 'fresh' })
      continue
    }
    const directory = sessionDir(options.root, header.cwd, header.id)
    // The session's directory must hold nothing but its own log file; any
    // other content keeps the whole directory in place.
    try {
      const entries = await readdir(directory)
      if (!entries.every(entry => KNOWN_LOG_NAMES.has(entry) || GENERATION_LOG_PATTERN.test(entry))) {
        skipped.push({ id, reason: 'foreign-contents' })
        continue
      }
    } catch {
      // An unreadable directory is as unknowable as a missing one.
      skipped.push({ id, reason: 'log-missing' })
      continue
    }
    const ageDays = Math.floor((options.now() - log.mtimeMs) / DAY_MS)
    if (options.dryRun) {
      deleted.push({ id, path: directory, ageDays })
      continue
    }
    try {
      await rm(directory, { recursive: true, force: false })
      deleted.push({ id, path: directory, ageDays })
    } catch (error) {
      failures.push({ id, path: directory, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { deleted, skipped, failures }
}
