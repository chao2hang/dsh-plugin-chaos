# `@deepseek-ai/dsh-plugin-chaos-think-tags`

English | [中文](README.zh.md)

Routes assistant text emitted in `<think>…</think>` delimiters through the existing collapsed Think disclosure.

## Behavior

The plugin replaces only the `assistant-step` conversation renderer. It coalesces adjacent text blocks before parsing delimiters, so a streaming response may split either tag across chunks. Content inside a matched region becomes a reasoning block; content outside remains assistant markdown. The existing Think row owns the collapsed summary, expansion, and streaming state.

The plugin does not alter session events, provider requests, persisted messages, or text without a matched opening tag. An unmatched opening tag keeps the remaining response in the Think disclosure.

## Composition

The `@deepseek-ai/dsh-plugin-chaos` bundle inserts this plugin as `chaos-think-tags`. Remove that row from the bundle patch to show provider-emitted delimiters as ordinary assistant text.

## Model Experience

No effect. The plugin reads browser conversation snapshots after the provider request completes or streams.

#### KV Cache Impact

No effect. The plugin does not assemble or send provider requests.

## Known Limitations and Deferred Work

- Delimiter parsing is presentation-only. A historical export or a provider retry still contains the original text blocks and delimiters.
- An unmatched `<think>` treats the remainder of that assistant step as reasoning, matching the provider's apparent open region.
