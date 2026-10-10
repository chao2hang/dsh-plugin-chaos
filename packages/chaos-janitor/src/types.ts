/**
 * Public retention records for the archived-session sweeper. Types only so
 * tests and the plugin entry consume them without sweep runtime code.
 * @module @deepseek-ai/dsh-plugin-chaos-janitor/types
 */

/** One executed or rehearsed session deletion. */
export interface JanitorDeletion {
  /** The deleted session's id. */
  readonly id: string
  /** The removed session directory. */
  readonly path: string
  /** Whole days since the session log was last written. */
  readonly ageDays: number
}

/** One archived session the sweep left in place, with the reason. */
export interface JanitorSkip {
  /** The session's id. */
  readonly id: string
  /** Why the sweep did not delete it: live, fresh, unreadable, or foreign contents. */
  readonly reason: 'live' | 'fresh' | 'log-missing' | 'foreign-contents'
}

/** One deletion that failed at the filesystem. */
export interface JanitorFailure {
  /** The session's id. */
  readonly id: string
  /** The directory the sweep tried to remove. */
  readonly path: string
  /** Filesystem error description. */
  readonly reason: string
}

/** One sweep's complete outcome. */
export interface JanitorOutcome {
  /** Sessions deleted (or rehearsed) in this pass. */
  readonly deleted: readonly JanitorDeletion[]
  /** Archived sessions left in place. */
  readonly skipped: readonly JanitorSkip[]
  /** Deletions that failed; the sweep continues past them. */
  readonly failures: readonly JanitorFailure[]
}
