---
description: "Presentation of provider-emitted think tags as collapsed reasoning disclosures in the conversation, for users choosing or debugging how assistant think-tag output renders."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-think-tags

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-think-tags` routes the spans an assistant message emits between `<think>…</think>` delimiters through the conversation's existing collapsed Think disclosure, instead of rendering them as ordinary assistant markdown. Adjacent text blocks are coalesced before parsing, so a streaming response may split either tag across chunks without breaking the region. Content inside a matched region becomes a reasoning block; content outside remains assistant markdown, and the existing Think row keeps owning the collapsed summary, expansion, and streaming state. The plugin changes no session event, provider request, or persisted message — parsing happens in the browser at render time.

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

Mount the plugin in a composition that renders the conversation UI; the renderer applies to every rendered assistant step.

### When to choose it

Choose this plugin when a provider emits its reasoning wrapped in literal `<think>…</think>` delimiters inside text blocks and you want that output presented as reasoning rather than as visible assistant text. Models whose reasoning already arrives as native reasoning blocks need nothing here: those blocks pass through unchanged. Removing the plugin row shows the delimiters again as ordinary assistant text.

### How parsing works

The plugin coalesces adjacent text blocks of one assistant step before parsing, then splits the text at every `<think>` and `</think>`. Text inside a matched region becomes a reasoning block; text outside remains assistant markdown. An unmatched opening `<think>` treats the remainder of that assistant step as reasoning, matching the provider's apparent open region; native reasoning blocks and non-text blocks pass through untouched.

### What stays untouched

Delimiter parsing is presentation-only. The plugin does not alter session events, provider requests, persisted messages, or text without a matched opening tag — the log keeps the original text blocks and delimiters exactly as the provider emitted them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half owns everything; the host entry is an empty `apply` so the Loader can mount the row.

### Renderer replacement

The client registers a keyed `conversation.chat.node` renderer for `assistant-step` with `priority: -1`, shadowing the default assistant renderer ui-chat installs; disposing the plugin restores the default across remount. `normalizeThinkTags` runs one pass over the step's blocks: non-text blocks are copied, runs of adjacent text blocks are joined, and a two-state scan splits the joined text at the delimiter constants, merging adjacent same-kind spans. The reasoning blocks render through the shared `DisclosureRow` primitive the native Think row uses.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host entry: empty `apply` for the Loader |
| [`src/client/index.ts`](src/client/index.ts) | Browser entry: the keyed `assistant-step` renderer registration |
| [`src/client/think-tags.ts`](src/client/think-tags.ts) | `normalizeThinkTags`: block coalescing and delimiter parsing |
| [`src/client/ThinkTagAssistantNodeView.tsx`](src/client/ThinkTagAssistantNodeView.tsx) | The replacement renderer, with the Think disclosure row |
| [`tests/think-tags.client.spec.ts`](tests/think-tags.client.spec.ts) | Delimiter parsing, split tags, and passthrough of ordinary and native blocks |
| [`tests/renderer-override.client.spec.ts`](tests/renderer-override.client.spec.ts) | The renderer shadows and restores the default across remount |
| — | No runtime invariant companion is published; the plugin owns one keyed UI registration whose disposal the renderer-override spec proves. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Chat UI](../../client/ui-chat/README.md) — the keyed node renderer family and the default assistant renderer this plugin shadows.
- [Conversation UI](../../client/ui-conversation/README.md) — the assistant blocks the normalizer consumes.
- [Chaos bundle](../chaos-bundle/README.md) — the layer that inserts this row.
- [web-app bundle](../../bundle/web-app/README.md) — the composition the Chaos layers build on.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin renders think tags as presentation in the browser; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the presentation ends. They are current package constraints, not a task backlog.

- **Delimiter parsing is presentation-only** — a historical export or a provider retry still contains the original text blocks and delimiters; the session log is never rewritten.
- **An unmatched `<think>` treats the remainder of that assistant step as reasoning** — the parser matches the provider's apparent open region rather than guessing where reasoning ended.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
