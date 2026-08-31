# Agent Note: Chaos sandbox escalation guidance

Status: implemented

English | [中文](2026-08-31-chaos-sandbox-escalation-guidance.zh.md)

## Problem

A resumed agent can read a prior sandbox-escalation failure without acting on the current session policy. When the session already has `danger-full-access`, it may repeat a Bash, write, or edit call with `sandbox_permissions: "danger-full-access"`. Strict-widening enforcement correctly rejects that non-escalation, but the resulting error can start another unproductive retry loop.

## Decision

`@deepseek-ai/dsh-plugin-chaos-sandbox-guidance` contributes per-request model guidance from `sandboxPolicy.resolve({ session })`. A `danger-full-access` session is told to omit `sandbox_permissions` and `justification` and call the tool directly. A confined session retains the one-retry, real-denial, strictly-wider escalation rule.

The plugin is mounted as `chaos-sandbox-guidance` by both the Web composition and the Chaos bundle. It does not rewrite tool arguments, relax enforcement, or convert a non-widening escalation into a successful call. The core sandbox policy remains the source of the effective mode; this plugin only supplies the missing action rule for resumed model context.

## Alternatives considered

**Make the executor silently accept equal or narrower requests.** Rejected because the strict-widening rule distinguishes an approved one-shot escalation from the standing session policy. Accepting redundant arguments would hide erroneous model behavior and weaken the enforceable escalation protocol.

**Change the core sandbox-policy context.** Rejected because that context deliberately states only capability-neutral policy facts. The retry mechanics and corrective instruction are Chaos-specific model guidance rather than the sandbox policy's shared contract.

**Inject correction only after the invalid tool result.** Rejected because a resumed agent needs the current-mode rule before its first tool call. Per-request system-prompt guidance reaches both fresh and resumed requests without adding another durable failure.

## Consequences

Resumed Chaos sessions receive an explicit direct-call instruction whenever their effective mode is `danger-full-access`, reducing redundant escalation attempts without changing the approved escalation path for confined sessions. The dynamic prompt section changes with the session mode and can reduce KV-cache reuse on the transition request. Models remain free to ignore guidance, so executor-side strict-widening enforcement stays necessary.
