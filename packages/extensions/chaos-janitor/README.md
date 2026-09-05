# `@deepseek-ai/dsh-plugin-chaos-janitor`

English | [中文](README.zh.md)

Retention sweeper for archived sessions in the Chaos profile. On an interval the plugin deletes every archived session whose session log has been quiet past a configured age; `maxArchivedDays: 0` (the default) keeps the sweeper mounted but inactive. It ships no browser half and renders no UI.

## Behavior

Each pass reads the workspace registry's durable archive set, lists persisted session headers, and deletes the session directory of every archived session whose log file has been quiet for more than `maxArchivedDays` days. A session is never deleted when it is live in the session store, when its log file cannot be read, or when its directory holds anything but a known log file — the sweep records a skip instead of guessing.

Deletion removes the session's own directory under the sessions root (`$DSH_HOME/sessions/<project>/<session>/`); paths come from the `dsh-session-persistence-jsonl` layout contract (`sessionDir` / `logPath`), never re-encoded here. The registry's archived set is read, never rewritten: the registry already filters sessions whose logs disappear, and leftover archived ids are inert. The first pass runs five seconds after boot, then once per `intervalMinutes`.

## Configuration

```yaml
- id: chaos-janitor
  name: '@deepseek-ai/dsh-plugin-chaos-janitor'
  config:
    maxArchivedDays: 0
    intervalMinutes: 60
    dryRun: false
```

- `maxArchivedDays` — age in days beyond which an archived session's log is deleted; `0` (default) disables deletion entirely.
- `intervalMinutes` — sweep cadence.
- `dryRun` — log the deletions a sweep would perform without deleting; use it to rehearse a retention value.

## Model Experience

None, as the plugin deletes durable session storage outside any model turn and contributes no model-visible input.

#### KV Cache effect

The plugin changes no model request, so it neither adds tokens nor changes KV Cache reuse.

## Known Limitations and Deferred Work

- Age is the log file's mtime, not the archive timestamp: the workspace registry records no archive time. A session quiet for thirty days and archived yesterday counts as thirty days old — never younger than its true archive age, never deleted while live.
- The sweep only sees sessions the jsonl backend materializes; a different persistence backend leaves every session in place.
- Deleting a session does not delete image attachments in the attachment store that only that session referenced; those bytes are orphaned until attachment retention exists.
- The registry's `archivedSessionIds` keeps ids of deleted sessions; they are inert (the registry filters missing sessions from every grouping surface) but accumulate until the registry prunes them.

**Runtime invariant:** No companion is published. Each sweep re-derives its candidates from the session registry and the log files' mtimes through the persistence layout contract; the plugin holds no state between sweeps, and the timer registration is disposed with its fiber.
