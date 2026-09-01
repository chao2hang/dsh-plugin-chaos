# Agent Note: Chaos think-tag rendering preserves the existing reasoning disclosure

Status: implemented

English | [中文](2026-08-25-chaos-think-tag-reasoning-rendering.zh.md)

## Problem

Some OpenAI-compatible domestic model gateways emit their reasoning as ordinary assistant text enclosed by `<think>` delimiters. The conversation renderer recognizes only structured reasoning blocks, so those delimiters and their contents appeared as visible answer text instead of the collapsed Think disclosure.

## Decision

`@deepseek-ai/dsh-plugin-chaos-think-tags` replaces the existing `assistant-step` keyed renderer through the Chaos bundle. It coalesces adjacent text blocks and maps text inside matched `<think>…</think>` regions to the existing reasoning-block presentation. The wrapped renderer keeps every existing markdown, image, tool, action, locale, and turn-tail behavior.

The conversion is browser presentation only. Provider events, session history, exports, retries, and model context retain the provider's original text blocks. An unmatched opening delimiter routes the remaining assistant step to the Think disclosure.

## Alternatives considered

**Modify the core provider stream adapter.** Rejected because gateway-specific delimiter compatibility belongs to the optional Chaos composition and does not justify changing the shared provider protocol for every deployment.

**Strip tags only in Markdown rendering.** Rejected because it would bypass the existing Think interaction and produce a second reasoning presentation path with different streaming and accessibility behavior.

**Treat every literal `<think>` occurrence as ordinary text.** Rejected because the affected providers use the delimiter as their reasoning protocol. Deployments that need literal tag examples can remove the optional Chaos row.

## Consequences

Affected provider responses display their reasoning in the same collapsed, expandable Think row as structured reasoning output. The compatibility layer is removable through the Chaos bundle patch and does not alter durable conversation data. Adjacent streaming chunks are parsed together, so delimiters split at chunk boundaries do not leak into the visible answer.

## Testing

`packages/extensions/chaos-think-tags/tests/think-tags.client.spec.ts` covers complete tagged output, tags split across adjacent text blocks, and coexistence with native reasoning blocks. The existing `ReasoningRow` tests continue to pin the Think disclosure interaction.
