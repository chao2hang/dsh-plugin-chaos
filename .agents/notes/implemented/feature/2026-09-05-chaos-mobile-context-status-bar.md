# Agent Note: chaos-mobile context meter moves to a top status bar and the overflow sheet

Status: implemented

English | [中文](2026-09-05-chaos-mobile-context-status-bar.zh.md)

## Problem

The chaos-mobile composer action row wrapped to two lines on a phone. The desktop rail (command, built-in paperclip, permission, model chip, context ring, send) plus the plugin's three-action attachment chooser left too many controls for one line, and the row's `flex-wrap` pushed the model chip, ring, and send button down. The mobile rail rules in mobile.css selected data anchors the dsh 0.1.3-alpha.1 InputBar never emitted (`data-input-actions-row`, `data-input-tools`, `data-composer-trailing`, `data-composer-command`, `data-composer-primary`), and the built-in paperclip was hidden through locale-specific `aria-label` matches, so none of the rules applied and both paperclips stayed visible.

## Decision

InputBar emits the stable anchors the mobile rail selects: `data-input-actions-row` on the row, `data-input-tools`, `data-composer-modes`, and `data-composer-trailing` on its groups, and `data-composer-command`, `data-composer-attach`, and `data-composer-primary` on the controls. mobile.css hides `[data-composer-attach]` by anchor instead of by label, keeping the plugin's three-action chooser as the single mobile attachment entry, and the one-nowrap-line rail rules now match.

The context ring leaves the phone rail. A new `ContextStatusBar` entry in the session-scoped `conversation.input.left` list reads the `contextPressure` and `contextBreakdown` projections through the session standard kit, publishes the folded meter to a plugin-local store, and portals a 3px full-width progress bar fixed below the navigation bar. The bar fills at the bounded occupancy percent and tints from the business blue to a warning color at 70% and a danger color at 90%. The ellipsis overflow sheet reads the same store and renders a 上下文占用 section with the occupancy percent, the used / window token counts, and the heuristic system / tools / message rows. The unmount of the entry clears the store, so the bar and the section disappear with the session. Desktop keeps the ring and its click panel.

## Alternatives considered

**Hide the built-in paperclip by position or label.** The aria-label match already failed outside its locale, and positional selectors break when the desktop row composition changes.

**Render the top bar from the shell overlay.** The `shell.overlay` seat is global scope and receives no projection kit; the composer's session-scoped slot already mounts and unmounts with the session, so the bar's lifecycle follows the session there without moving the reading into the layout layer.

**Read the projections inside the overflow sheet.** The sheet renders in the overlay's global-scope seat, which has no `useProjection`; a single-value plugin-local store is smaller than bridging session scope into the overlay.

## Consequences

The phone composer rail is one line: command, attachment chooser, permission, model chip, send. Context occupancy is glanceable as the thin bar above the conversation, and its token breakdown sits beside the existing 会话统计 section in the overflow sheet. An InputBar spec pins the emitted anchors; a component spec covers the meter fold, the projected-token preference, the 100% cap, the tint thresholds, the store's distinct-value notification, and the unmount clear; the overlay spec covers the sheet section's presence and omission; the mobile.css spec pins the anchor-based hiding and the bar placement.
