# `@deepseek-ai/dsh-plugin-chaos-restart`

English | [中文](README.zh.md)

Server self-restart: a host route pair that replaces the running process, and the System section on the Settings page that drives it.

## Behavior

The host half registers two routes on the web server:

- `GET /api/system/status` reports `canRestart`, read from the optional `processControl` service. A launcher that cannot spawn a successor reports `false`.
- `POST /api/system/restart` waits for `processControl` to confirm that a successor survived its startup window. It returns `{ ok: false, reason }` with HTTP 503 when replacement cannot begin; after `{ ok: true }`, `processControl` stops the current process on the next event-loop turn so the response can reach the browser.

The browser half adds a **System** section to Settings. It hides the control entirely when the host reports no restart capability, requires a confirmation step, and warns in that confirmation when sessions are currently running. Once the host accepts, the section shows a waiting state — the connection layer owns the reconnect, so the page recovers on its own.

## What a restart costs, and what it does not

Sessions are durable: they live in the session log on disk, not in process memory, so a restart does not lose conversation history. What a restart does end is any **in-flight turn**, because it dies with the process.

Such a turn leaves no `turn/end` of its own. The persistence layer repairs this on reload by closing it with `reason.kind === 'interrupted'`, keeping every event recorded before the exit. The `chaos-retry` plugin renders that closure and offers a one-click resend; without it the recovery is still correct but has no transcript row of its own.

Restart is an operator action behind a confirmation rather than an automatic recovery. An interrupted turn may have already run tools with side effects — writing files, running commands — and the log cannot reliably distinguish "the tool finished but its result was never recorded" from "the tool never ran", so replaying it is the operator's decision.

## Composition

`chaos-bundle/cordis.patch.yml` and the web-app patch mount this package as `chaos-restart`; its `enabled` config defaults to true. The host half needs `processControl` (`@deepseek-ai/dsh-process-control`) — absent it, the routes still answer and report no capability. Removing the row removes both the routes and the settings section. The package tsconfig restores the ambient `node` types the client base drops, because the host half serves HTTP routes.

## Known Limitations and Deferred Work

- The section reports acceptance, not completion: it cannot observe an independent successor startup failure. The launcher disposes the current application tree and releases its listener before spawning the successor, so a fixed port is not such a failure.
- `canRestart` is a launcher capability, not a permission. The endpoint's protection comes from the auth plugin's request guard when remote access is enabled; on loopback it is reachable as any other local route.
- The count in the confirmation covers sessions this browser knows about, not turns running for other connected clients.
