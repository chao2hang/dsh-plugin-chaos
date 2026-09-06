# Agent Note: The mobile settings page collapses to a chip row and one-line appearance cubes

Status: implemented

English | [中文](2026-09-05-mobile-settings-page-layout.zh.md)

## Problem

The phone settings page spent its vertical space on navigation instead of content. The section nav was a two-column grid of 44px cards (three rows for five sections, because the core's own horizontal chip row at phone widths was overridden by the fork's data-attribute rule), and the appearance preference wrapped into three stacked full-width cards because the desktop cube's 180px flex basis never fits a 390px line. On top of the page, the context status bar kept painting under the navigation bar, floating over settings content where it reads as a stray underline.

## Decision

The section nav becomes one horizontal scrollable chip row: chips are sized to their labels (`flex: none`), so no text clips, and the last chip peeking past the edge is the scroll affordance. The appearance row emits a `data-appearance-cubes` anchor on its cube container, and the mobile stylesheet reflows it into a compact three-column grid that fits every option on one line. `ContextStatusBar` observes the presence of `[data-settings-overlay]` — the same observation `MobileNavBar` uses — and renders nothing while the dedicated settings page covers the conversation; the store keeps publishing so the overflow sheet's details are unchanged.

## Alternatives considered

**Keep the two-column section grid.** It shows every destination without scrolling, but it spends three rows of the phone's scarcest resource and sits above content the user actually came to change.

**Restyle the cubes through hashed class selectors or the core's media query.** The module class names are build-hashed, and the fork's data-attribute rule already wins over the core's 560px block; a stable anchor on the core component is the same seam the composer and stats line use.

**Hide the bar with a CSS rule on the settings overlay.** The bar is a portaled body-level element that the overlay's stacking cannot reach; the component owns its own visibility.

## Consequences

The settings header block shrinks from roughly three rows to title plus one 40px chip row, and the appearance selection sits on a single 68px line. The context bar disappears for the life of the settings page and returns on close. The appearance-row spec pins the emitted anchor and its three cube buttons; the mobile.css spec pins the chip row and the three-column reflow; the context-status-bar spec covers the bar's hide and restore with the overlay's mount and unmount.
