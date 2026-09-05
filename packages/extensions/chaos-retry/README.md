---
description: "One-click resend of the last user message for abnormally ended conversations, plus the turn-interrupted transcript row crash recovery leaves, for users recovering failed, capped, or interrupted turns."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-retry

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-retry` shows a docked strip above the composer when a conversation's latest turn ended abnormally, offering a one-click resend of the conversation's last user message. Four endings qualify: a terminal turn error, an interrupted assistant prefix, the per-request output-token cap notice, and the crash-recovery closure a process death leaves. The plugin also contributes the missing `turn-interrupted` chat node, so a turn killed before its first token still projects to a transcript row instead of nothing. Clicking Retry writes the last user message into the composer draft and submits it through the public input actions — the same path the send button takes. The package is browser-only; the host entry exists so the Loader can mount the row.

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

Watch for the strip above the composer after a turn fails; it names the ending and offers Retry.

### When to choose it

Choose this plugin when conversation failures should stay recoverable from the transcript: it pairs with `chaos-restart`, whose System section performs the restart this plugin then offers to recover from. The strip never appears while the turn is still running or streaming, while messages sit in the queue or an interaction awaits a decision, or after the conversation moved past the failure (a new user message or a settled assistant answer); a removed session never shows it.

### What triggers the strip

The ending is read from the Chat target's last visible row (a trailing turn footer is looked past). Four endings qualify:

- a terminal turn error — the strip also shows the failure message;
- an interrupted turn — the assistant prefix is frozen;
- the per-request output-token cap notice; and
- a crash-recovery closure — the turn died with its process.

### What Retry does

Clicking Retry writes the last user message's text into the composer draft and submits it through the public input actions, so command adjudication, serialization, and notices stay owned by the input machine. The resend appends a new user message to the same session; it does not truncate the failed turn.

### The crash-recovery row

A turn whose process died — a server restart, a crash — writes no `turn/end` of its own; the persistence layer closes it on reload with `reason.kind === 'interrupted'`. The shipped node set has a Definition for every other terminal reason but not that one, and its interrupted-assistant fallback requires streamed content evidence, so a turn killed before its first token, or between a tool call and its result, would project to nothing at all. This package contributes the missing `turn-interrupted` node Definition and its transcript row, making the ending visible however far the turn got — and giving the strip something to detect after a restart.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half makes two contributions — one chat node Definition with its keyed renderer, and one dock entry — and owns no store.

### Design concept

The abnormal-end state is a pure derivation over split snapshots: `detectAbnormalEnd` reads the Session lifecycle, the Chat target, and the effective pending interaction, and answers only when the conversation is idle and its last visible Chat node is a terminal failure, a crash-recovery closure, an interrupted assistant prefix, or an output-token cap notice. `lastUserTextOf` walks the finalized conversation nodes backwards for the last user message's visible text. The `turn-interrupted` Definition matches only the persistence-written `turn/end { reason.kind === 'interrupted' }` marker, so an ordinary abort and a provider failure keep their own rows. The copy lives in the `chaos-retry` locale namespace.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host entry: empty `apply` so the Loader can mount the row |
| [`src/client/index.ts`](src/client/index.ts) | Browser entry: node registration, dock entry, locale namespace |
| [`src/client/retry-model.ts`](src/client/retry-model.ts) | Pure derivation: abnormal-end detection, last-user-text collection |
| [`src/client/turn-interrupted.ts`](src/client/turn-interrupted.ts) | The `turn-interrupted` node Definition and its state |
| [`src/client/RetryDock.tsx`](src/client/RetryDock.tsx) | The docked strip and the resend through the input actions |
| [`src/client/TurnInterruptedNodeView.tsx`](src/client/TurnInterruptedNodeView.tsx) | The crash-recovery transcript row |
| [`tests/retry-model.client.spec.ts`](tests/retry-model.client.spec.ts) | Which tails offer the strip, and which user text resends |
| [`tests/retry-dock.client.spec.tsx`](tests/retry-dock.client.spec.tsx) | Strip rendering and the ordered setDraft-then-submit resend |
| [`tests/turn-interrupted.client.spec.ts`](tests/turn-interrupted.client.spec.ts) | The Definition matches only the interrupted closure |
| — | No runtime invariant companion is published; the plugin owns no store — the abnormal-end state derives from the session snapshot each render. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Server self-restart](../chaos-restart/README.md) — the System section whose restart this plugin recovers from.
- [Conversation UI](../../client/ui-conversation/README.md) — the node Definition registry the crash-recovery row registers into.
- [Chat UI](../../client/ui-chat/README.md) — the Chat target the derivation reads and the keyed node renderer family.
- [web-app bundle](../../bundle/web-app/README.md) — the layer that mounts this row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin resends the last user message through the ordinary composer input path; the resent text reaches the model as plain user text, and the plugin contributes no fixed prompt section.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what a retry does and does not recover. They are current package constraints, not a task backlog.

- **The retry resends text only** — a last user message that carried images, or had no text at all, leaves the strip off, because the draft write path here is text-only.
- **Clicking Retry replaces the composer draft** — whatever is currently in the draft is overwritten with the resent text.
- **The resend does not roll back the failed turn** — it appends a new turn on top of the partial history rather than truncating it.
- **The registrations lack an HMR-safety spec** — no test disposes the plugin fiber and observes the node Definition, the keyed renderer, and the dock entry leave; the disposal proof the testing policy requires is deferred work here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
