/**
 * Pure retention sweep for stored uploads: every workspace directory known to
 * session persistence is scanned for the configured upload directory, and
 * regular files older than the configured age are unlinked. The sweep never
 * removes directories, never follows into subdirectories, and never touches
 * anything outside an upload directory — age is the file's own mtime.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** One workspace directory to sweep. */
export interface SweepTarget {
  /** Absolute workspace directory (a session's cwd). */
  readonly cwd: string
}

/** Fixed sweep inputs resolved by the caller. */
export interface SweepOptions {
  /** Workspace-relative upload directory, already validated. */
  readonly dir: string
  /** Age in days beyond which a file is deleted; 0 disables the sweep. */
  readonly maxAgeDays: number
  /** Rehearsal switch: log the deletions without performing them. */
  readonly dryRun: boolean
  /** Wall clock for age math (tests stub). */
  readonly now: () => number
}

/** One executed or rehearsed deletion. */
export interface SweepDeletion {
  /** Absolute path of the file removed (or that would be removed). */
  readonly path: string
  /** Whole days since the file was last written. */
  readonly ageDays: number
}

/** Contained per-file failure: the path plus the reason the unlink failed. */
export interface SweepFailure {
  /** Absolute path of the file that could not be removed. */
  readonly path: string
  /** Filesystem error description. */
  readonly reason: string
}

/** One sweep's outcome over one workspace's upload directory. */
export interface SweepOutcome {
  /** Files deleted (or rehearsed) in this workspace. */
  readonly deleted: readonly SweepDeletion[]
  /** Files whose unlink failed; the sweep continues past them. */
  readonly failures: readonly SweepFailure[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Sweep one workspace's upload directory for aged files.
 * @param target - the workspace whose `<cwd>/<dir>` is swept.
 * @param options - sweep inputs; `maxAgeDays` 0 answers an empty outcome.
 * @returns deletions and contained failures; an absent directory is an empty outcome.
 */
export async function sweepUploads(target: SweepTarget, options: SweepOptions): Promise<SweepOutcome> {
  if (options.maxAgeDays <= 0) return { deleted: [], failures: [] }
  const directory = join(target.cwd, options.dir)
  let entries: readonly import('node:fs').Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    // An absent or unreadable upload directory has nothing to retain.
    return { deleted: [], failures: [] }
  }
  const deleted: SweepDeletion[] = []
  const failures: SweepFailure[] = []
  const cutoff = options.now() - options.maxAgeDays * DAY_MS
  for (const entry of entries) {
    // Only flat regular files the uploader itself writes; directories and
    // anything else a person placed there stays untouched.
    if (!entry.isFile()) continue
    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      if (info.mtimeMs > cutoff) continue
      if (options.dryRun) {
        deleted.push({ path, ageDays: Math.floor((options.now() - info.mtimeMs) / DAY_MS) })
        continue
      }
      await rm(path, { force: false })
      deleted.push({ path, ageDays: Math.floor((options.now() - info.mtimeMs) / DAY_MS) })
    } catch (error) {
      failures.push({ path, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { deleted, failures }
}
