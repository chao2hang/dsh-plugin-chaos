---
description: "Server self-restart for the Chaos web profile: the /api/system status and restart routes plus the System settings section with its confirmation flow, for operators replacing the process and recovering sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-restart

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-restart` lets an operator replace the running web-server process from the browser: a host route pair on the web server and a System section on the Settings page that drives them. `GET /api/system/status` reports whether the launcher can spawn a successor; `POST /api/system/restart` waits for the process-control service to dispose the current application tree and spawn a detached successor with the same command line, then acknowledges over the still-open connection before the process completes. Sessions are durable — a restart costs the in-flight turn, not the conversation history — and the confirmation step warns when sessions are running. The section explains instead of offering the control when the host reports no restart capability.

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

Open Settings → System and confirm the restart; the section reports the host's capability before it offers the control.

### When to choose it

Choose this control when the web server runs under a launcher that can spawn a successor and an operator must replace the process without shell access — after a configuration change, or to clear a wedged state. It is an operator action behind a confirmation, never an automatic recovery: an interrupted turn may already have run tools with side effects, and the log cannot distinguish "the tool finished but its result was never recorded" from "the tool never ran", so replaying the turn stays the operator's decision. The host half needs the web server; the process-control service is optional and absent it the routes still answer and report no capability.

### Minimal configuration

```yaml
- id: chaos-restart
  name: '@deepseek-ai/dsh-plugin-chaos-restart'
  config:
    enabled: true
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Mount the host routes; `false` leaves them unregistered while the browser section stays mounted and reports no capability |

The web-app bundle patch mounts the row with `enabled: true`. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-plugin-chaos-restart) is the exhaustive source for every accepted field.

### What the routes answer

- `GET /api/system/status` answers `{ canRestart }`, read from the optional `processControl` service; a launcher that cannot spawn a successor reports `false`.
- `POST /api/system/restart` waits for `processControl` to dispose the current application tree and spawn a detached successor with the same command line. It returns `{ ok: false, reason }` with HTTP 503 when replacement cannot begin; after `{ ok: true }`, the route answers over the already-open connection and the current process completes once its event loop drains. A non-`POST` request answers 405.

### What a restart costs, and what it does not

Sessions live in the session log on disk, not in process memory, so a restart does not lose conversation history. What a restart ends is the in-flight turn, because it dies with the process. Such a turn leaves no `turn/end` of its own; the persistence layer repairs this on reload by closing it with `reason.kind === 'interrupted'`, keeping every event recorded before the exit. The `chaos-retry` plugin renders that closure and offers a one-click resend; without it the recovery is still correct but has no transcript row of its own. Once the host accepts, the section shows a waiting state — the connection layer owns the reconnect, so the page recovers on its own.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is a stateless host half over the web server plus a browser half that renders the section and drives the same routes over `fetch`.

### Host half

`apply` registers two `exact` routes on `ctx.webServer` inside one effect: the status route reads `ctx.get('processControl')` and answers its `canRestart` (or `false`), and the restart route awaits `processControl.restart()` — a refusal or throw becomes the 503 body. Both routes are pass-throughs to the optional service; neither holds state. The `enabled: false` config returns before any registration. The package tsconfig restores the ambient `node` types the client base drops, because the host half serves HTTP routes.

### Browser half

The client entry registers the `chaos-restart` locale namespace and one `settings.section` slot (`chaos-system`, order 90). `createRestartPort` wraps the two routes over `fetch`: a failing or malformed status answer is treated as no capability, and a resolved restart ack means accepted, never already-back. The section reads the running-session count from the scoped session-list snapshot; when the host reports no capability it renders the unsupported notice instead of the control.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host entry: `Config` schema, the two web-server routes |
| [`src/client/index.ts`](src/client/index.ts) | Browser entry: settings-section slot, locale namespace |
| [`src/client/restart-port.ts`](src/client/restart-port.ts) | `fetch` port over the two routes, with failure translation |
| [`src/client/RestartSection.tsx`](src/client/RestartSection.tsx) | The System section: capability gating, confirmation, wait state |
| [`tests/restart-route.spec.ts`](tests/restart-route.spec.ts) | Route semantics against a mounted fake web server |
| [`tests/restart-port.client.spec.ts`](tests/restart-port.client.spec.ts) | Port readings and failure translations |
| [`tests/restart-section.client.spec.tsx`](tests/restart-section.client.spec.tsx) | Section rendering: gating, confirmation, running-session warning |
| — | No runtime invariant companion is published; the host routes are stateless pass-throughs to the processControl service, and the section derives its state from that service each render. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Process control](../../boot/process-control/README.md) — the service that disposes the current tree and spawns the successor.
- [Retry strip](../chaos-retry/README.md) — the recovery affordance for the turn a restart interrupts.
- [web-app bundle](../../bundle/web-app/README.md) — the layer that mounts this row.
- [Host web server](../../host/webserver/README.md) — the route registration seam.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-plugin-chaos-restart) — the accepted config fields and their JSDoc.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package renders a settings section and host restart routes; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the operator still owns after clicking restart. They are current package constraints, not a task backlog.

- **The section reports acceptance, not completion** — it cannot observe an independent successor startup failure; the launcher disposes the current application tree and releases its listener before spawning the successor, so a fixed port is not such a failure.
- **`canRestart` is a launcher capability, not a permission** — the endpoint's protection comes from the auth plugin's request guard when remote access is enabled; on loopback it is reachable as any other local route.
- **The confirmation count covers sessions this browser knows about** — turns running for other connected clients are not counted.
- **`enabled: false` disables the host routes only** — the browser section stays mounted and then reports the launch method as unsupported.
- **The registrations lack an HMR-safety spec** — no test disposes the plugin fiber and observes the two routes and the settings section leave; the disposal proof the testing policy requires is deferred work here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
