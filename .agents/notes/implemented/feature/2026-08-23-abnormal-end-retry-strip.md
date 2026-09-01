# Agent Note: abnormal-end retry strip

Status: implemented

English | [中文](2026-08-23-abnormal-end-retry-strip.zh.md)

## Problem

When a conversation ends abnormally — a terminal turn error, an interrupted turn, or the output-token cap — the transcript shows what happened but offers no way forward. The user's only recovery is to find, copy, and retype their last message by hand.

## Decision

A pure UI plugin (`chaos-retry`) registers one `conversation.input.dock` entry. It derives the ending state from the session snapshot's last node each render and, when idle after an abnormal end, shows a docked strip with the terminal state and a Retry button. Retry writes the conversation's last user message text into the composer draft and submits through the public `inputActions` — the same admission, serialization, and notice path as the composer's own send button.

## Alternatives considered

**Replace the shipped turn-error chat node** (the keyed `conversation.chat.node` seat). That seat shadows shipped UI: the plugin would have to re-render the whole failure card, and the affordance would sit in scrolled-away history rather than at the composer where recovery happens. The dock is additive and always current.

**A host-side resend command or session RPC.** A server truncation/replay seam would touch core session semantics for a presentation-layer need; it would also imply rollback of the failed turn, which the first version deliberately does not attempt.

## Consequences

Retry appends a new user message on top of the failed turn; it does not truncate partial history. Text-only is the first-version scope: a last user message without resentable text leaves the strip off, and a click replaces whatever draft text is present. The plugin owns no store — every fact derives from the snapshot — so removal takes only its composition row.
