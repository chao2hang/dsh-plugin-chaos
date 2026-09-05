# Agent Note: Chaos unused-feature removal (at-file, sandbox-guidance)

Status: implemented

English | [中文](2026-09-04-chaos-unused-removal.zh.md)

## Problem

Two chaos packages shipped in the fork without ever serving the deployment: `chaos-at-file` had never been composed into the Web profile (the built-in `ui-reference` source owns the `@` gesture), and `chaos-sandbox-guidance` had been restored during the baseline supersession but never activated. The owner judged both unused and asked for their deletion.

## Decision

Both packages are deleted together with their wiring: root tsconfig paths and references, the chaos-bundle patch row, dependency, and README row for sandbox-guidance, and the client slot catalog regenerated without at-file's components. The at-file Agent Note triplet is deleted here; this note preserves what the removal gives up.

`chaos-at-file` gave up: a bounded workspace index (5000 files, dependency-directory exclusions), filename-first duplicate-safe picker rows, directory entry via ArrowRight with breadcrumbs, a reference dock, per-workspace exact and regular-expression filename filters, and paste-marker handling — the Codex-style `@path` interaction the built-in `ui-reference` does not reach. The model-visible `<workspace-reference>` marker grammar stays in production through `chaos-upload`, scoped to its upload directory.

`chaos-sandbox-guidance` gave up: two system-prompt guidance texts — for a `danger-full-access` session, "call tools directly with only normal arguments, never include sandbox_permissions or justification, and treat 'not strictly wider than this call's current' as a signal to remove redundant escalation arguments, not to retry"; for a confined session, "retry escalation at most once after a real denial, and only with a strictly wider mode". Sessions that habitually wrap escalation arguments lose that correction.

## Alternatives considered

**Keep both as dormant packages.** Rejected: the fork carries review and maintenance surface for code the deployment provably never loads; dead packages also failed the doc gates that every composed package passes.

**Enable them instead of deleting.** Rejected by the owner: the built-in `@` reference covers the need at-file served, and the guidance texts were judged unnecessary for the models in use.

## Consequences

Neither feature was live at removal time, so no restart is required and no runtime behavior changes; the bundle patch row that would have activated sandbox-guidance never took effect. If either capability is wanted again, both remain in the fork's git history (the supersession push restored sandbox-guidance once already) — re-adding means restoring the package and its glue, not rewriting it.

## Testing

The remaining chaos set passes unchanged (143 tests across chaos-mobile, chaos-upload, and chaos-janitor), the host and client typecheck aggregates are clean with both packages' references gone, and the regenerated slot catalog no longer lists at-file's components.
