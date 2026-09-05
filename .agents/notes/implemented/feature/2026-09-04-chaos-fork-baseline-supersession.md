# Agent Note: Chaos fork baseline supersession push

Status: implemented

English | [中文](2026-09-04-chaos-fork-baseline-supersession.zh.md)

## Problem

The Chaos fork's `master` had diverged twice: the remote still carried the old-baseline plugin history (ten commits ending at `fix(chaos-mobile): close initially open details panel`), while the local checkout held the never-pushed migration commit onto dsh 0.1.2-alpha.3. The migration had been cut from a tree without the remote's last fixes, so pushing it would silently drop content: the whole `chaos-sandbox-guidance` package and its bundle wiring, the mobile details-panel history claim, and the command-slash-button hiding.

## Decision

The push reconciles content first and supersedes history second. `chaos-sandbox-guidance` was restored from `chaos/master` and migrated: the plugin's context now registers directly in `apply` (its `inject` export already gates on `sandboxPolicy` and `systemPrompt`), and its test mounts `SessionProjectionRegistry` first because the policy service injects `sessionProjections` and never publishes without it. The details-panel claim and the slash-button CSS block plus their tests were restored into chaos-mobile. Root tsconfig glue, the bundle's patch row, dependency, and README row were re-added. Everything else in the remote's ten commits is either absorbed by the migration (chaos-auth's authenticated remote APIs, the `uiWorkspace` rename) or intentionally gone (chaos-desktop-panel).

The push itself is a lease-protected supersession: the migrated baseline replaces the old-baseline history on `chaos/master`, so the push uses `--force-with-lease` against the fetched remote head.

## Alternatives considered

**Merge `chaos/master` into the migrated baseline.** Rejected: it would tangle the fork's squashed-migration history with the superseded baseline and resolve the same conflicts through merge machinery; the restoration is a small, enumerable set.

**Cherry-pick the remote's ten commits.** Rejected: they were written against the old base and most are already absorbed; only three pieces of content were actually missing.

## Consequences

The remote's old-baseline commits become unreachable from `chaos/master` after the push (they stay fetchable by hash until collection). The restored `chaos-sandbox-guidance` becomes active on the next Web-profile restart through the chaos bundle row. The reconciliation relies on diffing the two branch tips by hand; a future migration cut from a stale tree needs the same audit — compare the chaos plugin directories against the remote before superseding.

## Testing

The restored package passes its guidance and invariant specs with the migrated registration shape (5 tests), and the full chaos set passes together: 143 tests across chaos-sandbox-guidance, chaos-mobile, chaos-upload, and chaos-janitor, with host and client typecheck aggregates clean.
