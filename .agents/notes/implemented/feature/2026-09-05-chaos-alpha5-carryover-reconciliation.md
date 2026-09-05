# Agent Note: Chaos alpha.5 carryover of the master-line plugin work

Status: implemented

English | [中文](2026-09-05-chaos-alpha5-carryover-reconciliation.zh.md)

## Problem

The alpha.5 migration (`update/dsh-0.1.2-alpha.5`) and the alpha.3 migration were cut from the same stale tree within the same minute, but [the janitor, upload, and sandbox-guidance work](2026-09-04-chaos-fork-baseline-supersession.md) landed on the alpha.3 line (`origin/master`) a day later. The alpha.5 branch therefore shipped without three chaos plugins and the tsdown root-entry fix — exactly the stale-tree failure mode the alpha.3 supersession note warned about, in the opposite direction: this time the local branch, not the remote, was missing content.

## Decision

Cherry-pick `e790c3274a` (the three plugins and their notes) and `4a0c0b50fe` (the tsdown fix) onto the alpha.5 branch, then reconcile the carried content with the alpha.5 baseline:

- `SessionHeader` gained the required `isSeeded` member in alpha.5; the janitor and sandbox-guidance fixtures set it to `false` (plain sessions, no fork lineage).
- `conversation.input.left` lost its `session` prop in the alpha.5 slot API. The attachment button reads the standard `sessionId` props member instead, and the `notifyInput` wiring resolves the session scope through `ctx.sessions.scope(sessionId)` before calling `conversation.input.for(actx)` — the inherited root-context `for(ctx)` call throws in alpha.5, because `input.for` requires a session scope. `chaos-mobile`'s `inject` gains `sessions`.
- The alpha.5 invariant-companion audit applies to the carried packages: the three empty companions, their `./invariant` exports, tsconfig references, build entries, `dsh-invariants` dependencies, and the sandbox-guidance invariant spec come out, and the no-companion reason moves into each README as the Runtime invariant line.
- README conformance: the janitor joins the model-experience sentence allowlist; sandbox-guidance carries a canonical entry grounded on its `chaos:sandbox-escalation` section; upload's three fields sit under an H3 title; the bundle README composes four rows in both languages with the pairing records re-recorded.
- `uploadReferenceForm` gains the `@param`/`@returns` its export requires.

## Alternatives considered

**Merge `origin/master`.** Rejected: the remote sits on the alpha.3 base, so the merge would drag roughly 2,500 files of base divergence through the same content the two commits already name.

**Re-cut the migration from a current tree.** Rejected: the alpha.5 branch already carries the audit commit; carrying two enumerable commits is smaller than redoing the migration and re-auditing it.

## Consequences

The branch now carries the full chaos set (eleven extension packages including the bundle). The pre-existing gate failures are unchanged by this carryover — verified identical on the parent commit: the `api`/`api/session-controller` README pairing drift, seventeen export-JSDoc gaps in the older chaos packages and `ui-theme`, and seven `verify-cordis-config` path mappings for the web-app bundle's chaos rows. A future migration cut from a stale tree still needs the same audit; this note is the alpha.5-side record that the warning is symmetric.

## Testing

Host and client typecheck aggregates clean; all 459 extension tests pass (462 minus the removed sandbox-guidance invariant spec); the jsonl persistence suite's 258 tests pass; both build faces emit, and `verify-package-invariants`, `verify-built-package-invariants`, `verify-package-readme-model-experience`, `verify-package-readme-limitations`, `verify-cordis-config`, and the pairing check for the touched packages all conform.
