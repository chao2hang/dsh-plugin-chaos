# `@deepseek-ai/dsh-process-control`

English | [中文](README.zh.md)

Generic process-control service for harness processes: a restart capability that hands the running command line to a detached successor.

## Service

`ProcessControlService` registers the `processControl` service key on the Cordis context. It is a service package: the concrete launcher provides an instance, and consumers such as `@deepseek-ai/dsh-plugin-chaos-restart` read it through `ctx.processControl`.

- `canRestart` reports `true` only when the process was launched with a command line (`process.argv.length > 1`) and the launcher provides the `appExit` service for a quiescent application teardown.
- `restart()` awaits `appExit(0)` to release the current application tree — including owned listeners, so a fixed port transfers without a race — then spawns a detached, unref'd successor with `process.execPath` and the same `process.argv.slice(1)`, inheriting the environment and stdio. It resolves `{ ok: true }` after the spawn; a second call while teardown is pending resolves `{ ok: false, reason: 'restart already pending' }`, and a teardown or spawn failure resolves `{ ok: false, reason }` without spawning.

## Model Experience

### Restart capability surface

#### What the model sees

Nothing. The service exposes `canRestart` and `restart()` on `ctx.processControl` for host-side process replacement; it registers no prompt section, tool schema, or session event.

#### Token effect

Zero: the capability flag and the successor spawn are process-lifecycle concerns and contribute no request tokens.

#### KV Cache effect

No effect. The package neither assembles nor sends a provider request, so it cannot change request tokens or KV Cache reuse.

## Known Limitations and Deferred Work

- **Teardown belongs to the launcher** — `restart()` awaits the `appExit` service and does not release listeners or stop the process itself; the launcher's teardown must dispose the application tree, including owned listeners, before the successor binds a fixed port.
- **The successor's startup is not observed** — the service spawns a detached, unref'd successor and returns; it cannot report an independent successor startup failure, and the current process does not wait for the successor.
- **The launch command is the Node command line** — the successor runs `process.execPath` with `process.argv.slice(1)` and the inherited environment; launchers that are not plain Node command lines (for example Electron) need a different mechanism.
- **A second request during teardown is refused** — while `appExit` settles, further `restart()` calls resolve `{ ok: false, reason: 'restart already pending' }`; after a teardown failure the flag resets and a retry is possible.

**Runtime invariant:** No companion is published. The service is stateless beyond a pending flag that the process lifecycle owns.
