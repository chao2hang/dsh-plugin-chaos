---
description: "Retention sweeper that deletes archived Chaos sessions once their JSONL session logs fall quiet past a configured age, for operators choosing maxArchivedDays, the sweep cadence, or rehearsing deletions with dry-run."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-janitor

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-janitor` deletes an archived session's directory once its session log has been quiet for more than `maxArchivedDays` days, sweeping the sessions root the JSONL backend writes. The default `maxArchivedDays: 0` keeps the plugin mounted but deletes nothing, so retention is always an explicit choice. A sweep never deletes a live session, a session whose log cannot be read, or a directory holding anything but a known log file — it records a skip instead of guessing. Set `dryRun: true` to log the deletions a retention value would perform before committing to it. The plugin ships no browser half and renders no UI.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the sweeper in a composition that already provides the workspace registry, session persistence, the live-session store, and the timer. The Chaos bundle inserts the row with `maxArchivedDays: 0`; enabling deletion is a config change, not a remount.

### When to choose it

Choose this sweeper when archived sessions should not accumulate forever under the sessions root. It requires the JSONL persistence backend's layout: paths come from the `sessionDir` / `generationLogPath` contract, and sessions materialized by a different backend stay in place. A composition without the workspace registry's archived set has nothing for the sweeper to act on.

### Minimal configuration

```yaml
- id: chaos-janitor
  name: '@deepseek-ai/dsh-plugin-chaos-janitor'
  config:
    maxArchivedDays: 30
    intervalMinutes: 60
    dryRun: false
```

| Field | Default | Meaning |
|---|---|---|
| `maxArchivedDays` | `0` | Age in days beyond which an archived session's log is deleted; `0` disables deletion entirely |
| `intervalMinutes` | `60` | Sweep cadence in minutes |
| `dryRun` | `false` | Log the deletions a sweep would perform without deleting |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-plugin-chaos-janitor) is the exhaustive source for every accepted field.

### What a sweep does

Each pass reads the workspace registry's archived set, lists persisted sessions through the persistence service's snapshot listing, and deletes the session directory of every archived session whose log file has been quiet for more than `maxArchivedDays` days. The first pass runs five seconds after boot, then once per `intervalMinutes`. Deletion removes the session's own directory under the sessions root (`$DSH_HOME/sessions/<project>/<session>/`); the registry's archived set is read, never rewritten — the registry already filters sessions whose logs disappear, and leftover archived ids are inert.

### What a sweep never deletes

- a session that is live in the session store;
- a session whose log file is missing or unreadable;
- a session directory holding anything but a known log file (`session.jsonl.zstd`, `session.jsonl`, or a `session.vN.jsonl` generation log with or without its `.zstd` suffix); and
- an archived id with no materialized header — the sweep has no path knowledge and leaves it be.

Each skip is recorded with its reason; a filesystem deletion failure is logged and the sweep continues past it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin entry derives the sessions root and owns the timer lifecycle; the sweep itself is a pure function over injected facts.

### Design concept

`sweepArchivedSessions` receives the archived id set, the persisted session headers, and a liveness probe, and returns deletions, skips, and contained failures — no Cordis context, so the retention rules are unit-testable against a temp directory. Age is the log file's mtime; a session is a candidate only when it is archived, not live, older than the cutoff, and its directory holds nothing but its own log file. The root is `dshHomePath('sessions')`, the same root the base bundle gives the JSONL backend, and paths come from that backend's layout contract (`sessionDir` / `generationLogPath`), never re-encoded here. The interval and the five-second boot pass ride the injected timer and are disposed with the plugin fiber.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `Config` schema, timer wiring, outcome log lines |
| [`src/sweep.ts`](src/sweep.ts) | Pure sweep: candidate derivation, skip rules, deletion |
| [`src/types.ts`](src/types.ts) | Public retention records consumed by tests and the entry |
| [`tests/sweep.spec.ts`](tests/sweep.spec.ts) | Sweep behavior against temp directories |
| — | No runtime invariant companion is published; each sweep re-derives its candidates from the registry, the headers, and the log mtimes, so the plugin holds no state between sweeps. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [JSONL session persistence](../../session/session-persistence-jsonl/README.md) — the backend whose layout contract supplies the swept paths.
- [Session persistence subsystem](../../../docs/subsystems/persistence.md) — backend-neutral service semantics.
- [Workspace registry](../../workspace/workspace/README.md) — the archived set the sweep reads.
- [Chaos bundle](../chaos-bundle/README.md) — the layer that inserts this row.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-plugin-chaos-janitor) — the accepted config fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin deletes durable session storage outside any model turn and contributes no model-visible input.

#### KV Cache effect

The plugin changes no model request, so it neither adds tokens nor changes KV Cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the sweeper is a poor fit or needs operational care. They are current package constraints, not a task backlog.

- **Age is the log file's mtime, not the archive timestamp** — the workspace registry records no archive time, so a session quiet for thirty days and archived yesterday counts as thirty days old; never younger than its true archive age, never deleted while live.
- **The sweep only sees sessions the JSONL backend materializes under `$DSH_HOME/sessions`** — a different persistence backend, or a JSONL root configured elsewhere, leaves every session in place.
- **Deleting a session does not delete its image attachments** — bytes in the attachment store that only that session referenced are orphaned until attachment retention exists.
- **The registry's `archivedSessionIds` keeps ids of deleted sessions** — they are inert (the registry filters missing sessions from every grouping surface) but accumulate until the registry prunes them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
