---
description: "The harness process-control service for plugin authors and launcher maintainers choosing or debugging process replacement: canRestart reporting and a detached successor spawned with the same command line after launcher-owned teardown."
kind: "package-reference"
---

# @deepseek-ai/dsh-process-control

English | [中文](README.zh.md)

## Summary

`dsh-process-control` tells a plugin whether the running process can replace itself and performs the replacement when asked. A consumer reads `canRestart` to decide whether to offer a restart control, then calls `restart()` to dispose the running application tree and spawn a detached successor with the same Node command line, inheriting the environment and stdio. Releasing owned listeners before the spawn lets a fixed listener port transfer without a timing race. The service is a generic extension point — the launcher supplies the teardown callback through `appExit`, consumers use `ctx.processControl`, and the plugin has no configuration.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Consume `ctx.processControl` when a plugin needs to replace the running process — the Web profile's self-restart routes are the shipped consumer. The common path is explicit: the launcher provides `appExit`, the composition mounts this service as a plain row, and the consumer reads `canRestart` before offering the action.

### When to choose it

Choose this service when a composition needs process replacement behind a launcher that owns a quiescent teardown callback. Avoid it when the process is not a plain Node command line — the successor replays `process.execPath` and `process.argv`, so a launcher such as Electron needs a different mechanism.

### Service surface

- `canRestart` reports `true` only when the process was launched with a command line (`process.argv.length > 1`) and the launcher provides the `appExit` service for a quiescent application teardown.
- `restart()` awaits `appExit(0)` to release the current application tree — including owned listeners, so a fixed port transfers without a race — then spawns a detached, unref'd successor with `process.execPath` and the same `process.argv.slice(1)`, inheriting the environment and stdio. It resolves `{ ok: true }` after the spawn; a second call while teardown is pending resolves `{ ok: false, reason: 'restart already pending' }`, and a teardown or spawn failure resolves `{ ok: false, reason }` without spawning.

### Mounting

The plugin mounts without configuration — a plain row in the composition, as the Web profile's patch does. There is no Config interface and no `config` block; `canRestart` stays `false` until a launcher provides `appExit`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the handoff sequence and the test seam; the observable contract is covered in [Use this package](#use-this-package).

### Design concept

The service is one Cordis `Service` with a single pending flag. `restart()` orders the two steps deliberately — launcher-owned teardown first, spawn second — so the successor cannot bind a listener the dying tree still holds. Teardown belongs to the launcher because only the launcher knows how to dispose the whole application; the service only awaits it. The successor is spawned detached and unref'd through the exported `internals.spawn` seam, so tests substitute the spawn without touching `node:child_process`.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service entry: `IProcessControl` face, `RestartResult`, `ProcessControlService`, `internals` test seam |

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Restart capability

#### What the model sees

Nothing from this package: `ctx.processControl` is a host-side capability that registers no prompt section, tool schema, or session event. A restart is a process replacement, not a model turn — `restart()` awaits the launcher's teardown of the whole application tree, then spawns a successor running the same command line. Conversation history reaches the successor only through the session-persistence seam's durable logs; nothing in this package carries in-memory session state across the replacement, and an in-flight turn ends with the disposed tree.

#### Token effect

Zero. `canRestart` and the successor spawn are process-lifecycle operations that contribute no request tokens; the successor process assembles its own requests from restored durable history.

#### KV Cache effect

No effect on any live request. The package neither assembles nor sends a provider request, so it cannot change request tokens or KV Cache reuse; a restarted process starts with no provider cache of its own, and reuse there depends on the successor's reconstructed history matching its request prefix, which the persistence seam and the loop own.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the service cannot deliver a quiescent replacement. They are current package constraints, not a task backlog.

- **Teardown belongs to the launcher** — `restart()` awaits the `appExit` service and does not release listeners or stop the process itself; the launcher's teardown must dispose the application tree, including owned listeners, before the successor binds a fixed port.
- **The successor's startup is not observed** — the service spawns a detached, unref'd successor and returns; it cannot report an independent successor startup failure, and the current process does not wait for the successor.
- **The launch command is the Node command line** — the successor runs `process.execPath` with `process.argv.slice(1)` and the inherited environment; launchers that are not plain Node command lines (for example Electron) need a different mechanism.
- **A second request during teardown is refused** — while `appExit` settles, further `restart()` calls resolve `{ ok: false, reason: 'restart already pending' }`; after a teardown failure the flag resets and a retry is possible.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The service is stateless beyond a pending flag that the process lifecycle owns.
