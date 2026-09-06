# Agent Note: The conversation stats line leaves the phone workspace for the overflow sheet

Status: implemented

English | [中文](2026-09-05-mobile-stats-line-overflow-sheet.zh.md)

## Problem

On a phone the conversation stats line (turns / steps, LLM and tool wall time, TTFT and decode speed, cache hit, token totals) sat under the composer, competing with the action row for the only real estate a phone has. The mobile stylesheet already hides `[data-stats-line]` and the overlay already mirrors the row's rendered text into a 会话统计 section of the overflow (ellipsis) sheet, but the dsh 0.1.3-alpha.1 `StatsLine` never emitted the `data-stats-line` attribute, so the hide rule matched nothing and the mirror read nothing: the line stayed on screen on every phone session.

## Decision

`StatsLineContent` emits `data-stats-line` on its measured row element, which already carries the full formatted line as text. The row stays mounted while hidden: it keeps owning the `sessionStats` / `tokenUsage` projection reads, the window fallback fold, and locale formatting, while the overlay's existing observer only follows its rendered text. No mobile-side code changed; the two dormant consumers activate on the anchor.

## Alternatives considered

**Re-derive the figures inside the overflow sheet.** The sheet renders in the overlay's global-scope seat, which has no projection kit; duplicating the projection reads, the fallback fold, and every locale group there would put a second formatter next to the line it shadows.

**Select the row by CSS module class or DOM position.** The class is hashed per build and the row's place in the dock moves with the dock's composition, so both selectors break silently.

## Consequences

The phone workspace no longer carries the stats line, and the overflow sheet shows the complete formatted row under the 上下文占用 section in a 会话统计 section. The chat stats spec pins the emitted anchor and that its text equals the full line; the mobile.css spec pins the hide rule; the overlay spec covers the sheet section through the same anchor.
