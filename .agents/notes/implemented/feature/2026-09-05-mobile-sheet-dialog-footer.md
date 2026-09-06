# Agent Note: Phone dialogs open at the large detent with their action row pinned

Status: implemented

English | [中文](2026-09-05-mobile-sheet-dialog-footer.zh.md)

## Problem

On the phone, every `Modal`-backed dialog — most visibly the model-capability settings sheet — opened at the medium detent (50dvh) and its action row (取消/保存) scrolled with the form content. The capability form is tall: two slider cards with eight stop chips each, a multimodal row, and the thinking-level group. At the medium detent only the first card fit, and saving required scrolling past everything else to a button that was not on screen.

## Decision

`SurfaceSheetProps` carries an optional `footer`: the Modal hands its dialog action row to the sheet presenter separately from the body content, and `MobileSheet` pins it below the scrollable body (`data-chaos-sheet-footer`), reclaiming the sheet's safe-area bottom padding via `:has()` so it is not counted twice. The chaos-mobile presenter opens `dialog` surfaces at the large detent (90dvh) so form content is visible at once; `menu` and `tooltip` surfaces keep the compact medium detent. Two mobile.css rules targeting anchors the rebaselined component never emits (`[data-model-capabilities-trigger]`, `[data-model-capabilities-field]`) were deleted; the stop buttons now grow to a 36px touch height through the anchor the component does emit (`[data-model-capabilities-capacity]`).

## Alternatives considered

**Sticky footer inside the scrollable body.** It works per dialog but leaves safe-area handling to each dialog's own CSS and gives the presenter no uniform grip on where the actions sit.

**Large detent for every sheet surface.** The model list and other menus are short; a 90dvh sheet covers the conversation for no gain and hides the drag-to-dismiss affordance's low starting point.

**Keep the dead capability rules.** They no longer matched anything; hiding a trigger that no longer exists and restyling fields that no longer exist only re-creates the fork's recurring missing-anchor drift.

## Consequences

A dialog's primary action is visible at every scroll position on the phone, and the capability form (both slider cards plus the multimodal row) fits one screen with the footer pinned. The mobile-sheet spec pins the footer outside the scroll container; the mobile-overlay spec pins large-for-dialog and medium-for-menu detents; the surface-presentation spec pins the footer hand-off; the mobile.css spec pins the removal of both dead anchors.
