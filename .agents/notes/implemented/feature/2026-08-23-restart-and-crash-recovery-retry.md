# Agent Note: restart control and crash-recovery retry

Status: implemented

English | [中文](2026-08-23-restart-and-crash-recovery-retry.zh.md)

## Problem

`chaos-restart` shipped a working `/api/system/restart` route with no UI, so the restart it advertised was unreachable from the product. Making it reachable raised the harder question: a restart kills the in-flight turn, and the operator needs a way back.

Investigating that exposed a gap. The persistence layer already closes a crash-orphaned turn on reload with `turn/end { kind: 'interrupted' }`, but **no client Definition matches that reason**. `turn-error` and `turn-max-tokens` each have one; the interrupted case relied on ui-conversation's interrupted-assistant fallback, which requires streamed content evidence (`hasInterruptionEvidence`). A turn killed before its first token — the common case when restarting, since the turn is usually waiting on the model or a tool — projected to nothing. The recovery was correct in the log and invisible in the UI.

## Decision

Three parts, all in the extensions tier:

1. `chaos-retry` contributes a `turn-interrupted` node Definition matching only the persistence-written marker, plus its transcript row. External packages may register Definitions (`ui-goal` does), so this needs no change to `packages/client`.
2. `chaos-retry`'s detection moved from the legacy `session.nodes` slice to the Chat target (`session.chat.order` + `nodes.get`), because the contributed node only exists there. It skips hidden rows and the turn-tail footer to find the row that actually ended the turn.
3. `chaos-restart` gained a browser half: a System settings section with a capability check, a confirmation step, a running-session warning, and a wait state.
4. `process-control` awaits the launcher-owned `appExit` teardown before spawning its detached successor. The CLI resolves that callback only after the root fiber disposes, including the web listener, so a fixed Web port is available before the successor binds.

Restart stays a confirmed operator action, and recovery stays one click rather than automatic.

## Alternatives considered

**Auto-rerun the interrupted turn after restart.** Rejected: an interrupted turn may have already run tools with side effects, and the log cannot distinguish "the tool finished but its result was never recorded" from "the tool never ran". Auto-replay would silently repeat writes. The user chose the manual strip over both this and a "rerun only turns with no tool calls" middle option.

**Put the node Definition in ui-conversation, beside `turn-error`.** Arguably its natural home — the gap is in the shipped node set, and fixing it there would benefit deployments without the chaos plugins. The user chose to keep the change inside the extension; the cost is that the crash-recovery row is invisible without `chaos-retry` installed.

**Put the restart UI in `chaos-retry`** (already a configured client package) rather than converting `chaos-restart` to dual-half. Rejected: `chaos-restart`'s own manifest already described a "settings page system section", so the UI belonged to it. The conversion moved it to the client aggregate and required restoring ambient node types, since its host half genuinely serves HTTP.

**Auto-rearm an active goal after restart.** Rejected with the user: goals are deliberately disarmed after a session resume, and auto-rearming would let a restart loop burn tokens unattended.

## Consequences

A timer cannot prove a successor bound its listener. The restart action now trades overlap for a brief outage: it closes the predecessor listener before spawning the successor. Launchers that cannot provide this awaited teardown report no restart capability.

`chaos-restart` is now a dual-half package: it left `tsconfig.host.json` for `tsconfig.client.json` (one aggregate per package) and declares `"types": ["node", "client-build-environment"]` because the client base drops ambient node types its host half needs. Its host bundle grew from ~1 kB to ~31 kB: the shared `clientBundle` preset externalizes only production dependencies, and no workspace package declares `schemastery`/`cosmokit` as such, so they inline. The purity gate passes and the host half loads unchanged.

The section reports acceptance, not completion: it cannot observe an unrelated successor startup failure. Fixed-port handoff is ordered and does not depend on a startup window.

`chaos-restart` also gained the README it never had. Its handler acknowledges the request before it begins application teardown, so the client can enter its reconnect wait.
