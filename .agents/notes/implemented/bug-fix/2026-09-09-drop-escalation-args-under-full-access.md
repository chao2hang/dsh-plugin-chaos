# Agent Note: Drop escalation arguments a danger-full-access call cannot use

Status: implemented

English | [中文](2026-09-09-drop-escalation-args-under-full-access.zh.md)

## Problem

Models that drive DSH tool schemas from other providers frequently fill every optional field: `bash`, `pwsh`, `write`, and `edit` calls arrived carrying `sandbox_permissions` plus `justification` on the first attempt, with no prior denial. When the session already runs under `danger-full-access` (a deployment default or a runtime mode switch), that escalation path is a guaranteed failure: `WIDER_MODES['danger-full-access']` is empty, so `approveEscalation` rejects every request as `sandbox escalation to "<mode>" is not strictly wider than this call's current "danger-full-access" mode` before any human is prompted. Such models could not map that error onto "stop sending these fields", retried the identical arguments, and looped for the rest of the turn budget — while the session already ran at the widest mode the retry claimed to need.

## Decision

Escalation arguments are normalized at the execution boundary, after each tool resolves the call's standing policy — no longer at static argument validation:

- `normalizeEscalationArgs(sandboxPermissions, justification, effectiveMode)` joins the shared escalation vocabulary in `dsh-sandbox`. When the standing mode is `danger-full-access`, both fields are dropped — escalation is neither possible nor required — and execution proceeds under the standing mode. Under a narrower or unresolved mode, the shared pairing rule (`sandbox_permissions` ⇔ `justification`, non-empty) is enforced unchanged.
- `dsh-tool-bash`, `dsh-tool-pwsh`, and `dsh-tool-fs` (`FsSandboxController.resolvePolicy`, shared by `write`/`edit`) moved their `validateEscalationArgs` call from static arg validation into this post-resolution step, feeding it the just-resolved `standingPolicy.mode`.

`approveEscalation` is unchanged: strict widening, approval routing, and fail-closed outcome mapping keep their exact order and texts, so confined sessions see no behavioral difference. A dropped request never prompts a human.

## Alternatives considered

**Keep failing closed and rely on the model.** Rejected: the error names an impossible escalation, not an action the model can take; the observed external-model behavior was an unconditional retry loop, not recovery.

**Stop advertising the escalation fields when the composition default is full access.** Rejected: schemas are registry-global while the effective mode is per-session — a session overridden narrower than a full-access default would lose its only lever. The [sandbox decision](../feature/2026-07-06-sandbox.md) records this same reason for keeping the enum the closed target vocabulary.

**Let `danger-full-access` widen to itself.** Rejected: it would make the strict-widening check vacuous at the top rung and grant nothing the call lacks. The arguments are noise, and noise is dropped, not honored.

**Fold the whole check into `approveEscalation`.** Rejected: the drop must happen before approval is even considered, and pairing errors would otherwise surface at different pipeline stages across the two enforcing families; one shared boundary function keeps their ordering identical.

## Consequences

A `danger-full-access` session executes normally while a model speculatively fills the escalation fields, instead of looping on a rejection it cannot act on; nothing widens because nothing is wider. Malformed pairing (one field without the other) under full access is dropped with the rest. Confined modes are untouched: pairing validation still fails closed there, and a non-widening request under a confined mode still fails with its own text without prompting anyone. The three tools' static validators no longer check escalation pairing, so their arg-validation order is unchanged for every non-escalation field.

## Testing

`normalizeEscalationArgs` unit tests in `dsh-sandbox` pin the drop under full access, the passthrough under narrower and unresolved modes, and the pairing enforcement. Tool-level regressions in `dsh-tool-bash`, `dsh-tool-pwsh`, and `dsh-tool-fs` run a speculative escalation under a `danger-full-access` session and assert the call executes without error under its standing mode.
