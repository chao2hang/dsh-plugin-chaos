# Agent Note: mobile sheet dialog content collapse

Status: implemented

English | [中文](2026-08-23-mobile-sheet-dialog-content-collapse.zh.md)

## Problem

On a phone, the workspace directory dialog opened through chaos-mobile's bottom sheet showed its header and footer but no directory rows: the home listing landed, the rows rendered, and the Miller columns collapsed to zero height, clipping every row out of view.

The desktop Modal card is a 500px flex column, so the browser's `.content { flex: 1 1 0 }` receives a definite height. The sheet's body was a plain block scroller: nothing gave the content area a definite height, and because the Miller row and the columns are scroll containers (`overflow` other than `visible`), their content contributes nothing to intrinsic sizing — the auto-height chain resolved to 0px at every level.

## Decision

MobileSheet's body is a definite-height flex column (`display: flex; flex-direction: column; min-height: 0`), matching the desktop card's layout contract. Headless dialog content keeps owning its flexible middle; the sheet only guarantees the parent that middle needs. Menus and other sheet surfaces lay out unchanged (a full-width block child behaves identically as an auto-height flex item).

## Alternatives considered

**Give the sheet body a fixed pixel height.** Rejected: a hardcoded height breaks other sheet surfaces and viewports; the flex contract matches the desktop card without naming a number.

**Patch each dialog to size its own content.** Rejected: the auto-height chain collapses at every level for scroll-container content, so each headless dialog would re-derive the same parent requirement.

## Consequences

The directory picker lists visibly on phones; `apps/web/tests/mobile-directory-picker.e2e.ts` pins the row geometry at a phone viewport and fails against the collapsed layout. Any future headless sheet dialog with a flexible middle gets correct sizing by construction instead of re-deriving it.
