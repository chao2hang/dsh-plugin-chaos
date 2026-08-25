# Agent Note: Conversation reading rhythm without theme redefinition

Status: implemented

English | [中文](2026-08-24-conversation-reading-rhythm-without-theme-redefinition.zh.md)

## Problem

The conversation view contained the correct information but gave long assistant responses, user prompts, and the composer nearly the same visual weight. Changing the established blue theme to solve that problem would make the conversation inconsistent with the rest of the application.

## Decision

The conversation view keeps its existing semantic color tokens and changes only geometry and typography. The transcript, header, and composer retain their established shared width axis. Assistant text uses a compact 15px/26px reading rhythm with restrained block spacing, and user prompts occupy a smaller annotated bubble with the existing bubble fill and existing border token. The sticky composer mask preserves a clean separation while scrolling.

## Alternatives considered

- **Re-theme the conversation with the ink-and-cinnabar entry palette** — this would make the page resemble the protected entry state, but it would override the established application theme and make visual preference handling less coherent.
- **Add cards and fills around every message** — stronger separation would reduce scan effort in short chats, but it would make long assistant output feel fragmented and heavy.

## Consequences

- Existing light/dark preferences and all color token ownership remain unchanged.
- Long assistant answers remain the primary surface without reducing information density; user messages stay easy to locate without becoming a competing panel.
- The established shared width variables keep the input card and transcript aligned on desktop and narrow viewports.
- CSS changes remain in the conversation package so mobile adaptation and InputBar behavior can evolve independently.
