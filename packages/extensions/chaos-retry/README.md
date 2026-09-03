# `@deepseek-ai/dsh-plugin-chaos-retry`

English | [中文](README.zh.md)

One-click retry for an abnormally ended conversation: a docked strip above the composer that resends the conversation's last user message.

## Behavior

When a conversation's latest turn ends abnormally, the strip appears above the composer with the terminal state and a **Retry** button. Four endings qualify, read from the Chat target's last visible row:

- a terminal turn error (the strip also shows the failure message);
- an interrupted turn (frozen assistant prefix);
- the per-request output-token cap notice; and
- a crash-recovery closure, i.e. the turn died with its process (see below).

## The crash-recovery row

A turn whose process died — a server restart, a crash — writes no `turn/end` of its own; the persistence layer closes it on reload with `reason.kind === 'interrupted'`. The shipped node set has a Definition for every other terminal reason but not that one, and its interrupted-assistant fallback requires streamed content evidence. A turn killed before its first token, or between a tool call and its result, would therefore project to **nothing at all**.

This package contributes the missing `turn-interrupted` node Definition and its transcript row, so the ending is visible however far the turn got — and so the retry strip has something to detect after a restart.

The strip stays hidden while the turn is still running or streaming, while messages sit in the queue or an interaction awaits a decision, and whenever the conversation later moved past the failure (a new user message or a settled assistant answer). A removed session never shows it.

Clicking **Retry** writes the last user message's text into the composer draft and submits it through the public input actions — the same path the composer's send button takes, so command adjudication, serialization, and notices stay owned by the input machine. The resend appends a new user message to the same session; it does not truncate the failed turn.

## Composition

The web-app patch mounts this package as `chaos-retry`. The client half contributes the `turn-interrupted` node Definition with its keyed `conversation.chat.node` renderer, plus one `conversation.input.dock` entry. It owns no store: the abnormal-end state derives from the session snapshot each render, and the copy lives in the `chaos-retry` locale namespace. Removing this plugin removes the strip and the crash-recovery row; the conversation and the recovery itself are unaffected.

It pairs with `chaos-restart`, whose System settings section performs the restart this plugin then offers to recover from.

## Model Experience

None, as the plugin resends the last user message through the ordinary composer input path; the resent text reaches the model as plain user text, and the plugin contributes no fixed prompt section.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The retry resends text only. A last user message that carried images (or no text at all) leaves the strip off, because the draft write path here is text-only.
- Clicking **Retry** replaces whatever is currently in the composer draft with the resent text.
- The resend does not roll back the failed turn's partial history; it appends a new turn on top of it.

**Runtime invariant:** No companion is published. The single conversation.input.dock registration's disposal is proven by the HMR-safety spec, and the plugin owns no store — the abnormal-end state derives from the session snapshot each render, it emits no cordis events, and it holds no cross-plugin mutable state.
