# Agent Note: Janitor generation-log pattern matches both compression spellings

Status: implemented

English | [中文](2026-09-05-janitor-generation-log-pattern.zh.md)

## Problem

`GENERATION_LOG_PATTERN` in `packages/extensions/chaos-janitor/src/sweep.ts` accepted `session.vN.zstd` and `session.vN.jsonl`, but the jsonl persistence writes version-tagged generation logs as `session.vN.jsonl` with an optional `.zstd` suffix (`session.vN.jsonl.zstd`). Sessions written with default compression therefore held a generation log the sweeper classified as foreign contents, and `sweepArchivedSessions` never deleted those directories no matter how far past `maxArchivedDays` they aged.

## Decision

The pattern is now `/^session\.v\d+\.jsonl(?:\.zstd)?$/u`, matching the persistence layer's actual `generationLogFilename` spellings in both plain and zstd form. `KNOWN_LOG_NAMES` already listed both spellings for the non-versioned log, so the version-tagged family now agrees with it. The regression test `sweeps version-tagged generation logs in either compression spelling` covers both forms end to end.

## Alternatives considered

- Sharing one filename grammar with the jsonl persistence package: rejected because the sweeper must stay independent of the persistence implementation it audits; duplicating the two committed spellings in a comment next to the pattern keeps the coupling visible without an import.

## Consequences

Sweeping now deletes archived sessions whose generation log uses the default compression spelling, which was the plugin's documented contract all along; directories previously skipped age out on the next sweep. Sessions with genuinely foreign files (anything outside the two known names and the version-tagged family) are still skipped for manual review.

## Testing

`npx vitest run packages/extensions/chaos-janitor/tests/sweep.spec.ts` — 9/9, including both compression spellings of the version-tagged generation log.
