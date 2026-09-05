# Agent Note: Chaos-janitor archived-session retention

Status: implemented

English | [中文](2026-09-04-chaos-janitor-archived-session-retention.zh.md)

## Problem

The Web GUI's only session-lifecycle gesture is archiving: the workspace registry hides an archived session from every grouping surface but keeps its log, and no product surface deletes sessions at all — deleting a workspace removes only the registry record. Archived session logs therefore accumulate forever under the sessions root, and the user wanted archived sessions cleaned after a period.

## Decision

`@deepseek-ai/dsh-plugin-chaos-janitor` owns archived-session retention as a Host-only chaos plugin, mounted by the Chaos bundle with `maxArchivedDays: 0` (deletion opt-in). Each pass reads the registry's durable `archivedSessionIds`, lists headers through `ctx.sessionPersistence.list()`, and deletes the session directory of every archived session whose log file mtime is older than the configured age — skipping any session that is live in the session store, whose log cannot be read, or whose directory holds anything but a known log file, and never rewriting the registry: the registry already filters sessions whose logs disappear.

Session paths come from the jsonl persistence layout contract. The package's index now re-exports `sessionDir`/`logPath`/`projectDir`/`projectKey`/`logSuffix` from `format.ts`, so the sweeper derives every path through the owning package instead of re-encoding the directory naming, and the sessions root resolves through `dshHomePath('sessions')` from `dsh-home-paths`.

The sweeper also never runs without an explicit retention value, supports `dryRun` to rehearse a value, and runs its first pass five seconds after boot rather than waiting a full interval.

Uploaded-file retention stays with its owner: `chaos-upload` gained `maxAgeDays` (default 0) that unlinks flat upload files older than the age across every workspace known to session persistence, never removing directories.

## Alternatives considered

**A session-delete seam in core.** Rejected for this change: a correct product surface would add a persistence-level delete plus registry forget plus GUI wiring across several core packages; the Chaos-profile sweeper reaches the same effect through the existing public reads (registry set, header listing, session-store liveness) plus the now-exported layout contract.

**Timestamped archive ages.** Rejected: the registry records no archive time, and adding one is a durable-state migration for precision the mtime already bounds — an archived session is never deleted younger than its true archive age (mtime precedes archiving) and never while live.

**Deleting uploads with their referencing sessions.** Rejected: uploads live per workspace, not per session — multiple sessions of one workspace share `uploads/`, so ownership would need per-session subdirectories and visibly longer `@path` mentions. Age-based retention keeps the mention shape unchanged.

## Consequences

Retention is age-based and blind to references: an upload or archived session quiet past the age is deleted even if a still-open turn would mention it later — the upload marker degrades to plain text and the archived session is gone from every listing. Image attachments that only a deleted session referenced remain in the attachment store as orphaned bytes until attachment retention exists. The registry's `archivedSessionIds` accumulates ids of deleted sessions; they are inert (missing sessions are filtered from every grouping surface) but are not pruned. The layout coupling is explicit and imported: if the jsonl backend changes its directory naming, the sweeper follows the exported contract or safely finds no logs.

## Testing

`packages/extensions/chaos-janitor/tests/sweep.spec.ts` covers the quiet/live/fresh/log-missing/foreign-contents matrix, disabled retention, dry-run rehearsal, and the `_no-cwd` directory against the real layout functions over a temporary sessions root. `packages/extensions/chaos-upload/tests/sweep.spec.ts` covers upload retention: aged-file deletion, fresh-file and subdirectory preservation, disabled retention, and dry-run.
