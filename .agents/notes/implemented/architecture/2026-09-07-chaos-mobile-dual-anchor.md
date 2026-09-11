# Agent Note: chaos-mobile on released frontends — dual anchors and the plugin-owned details push page

Status: implemented

English | [中文](2026-09-07-chaos-mobile-dual-anchor.zh.md)

## Problem

`chaos-mobile` was built against the fork's 0.1.3-alpha.1 web client, whose AppFrame emitted `data-shell-frame`, `data-shell-column`, and `data-shell-handle`. The released `dsh` 0.1.2-rc.1 AppFrame emits none of those: only `data-sidebar-collapsed` / `data-details-collapsed` (present only while collapsed, and frame-exclusive), the slot seats, and the overlay layer. After the global install moved to a released build, every chaos-mobile selector stopped matching: the drawer CSS never applied (the sidebar stayed the core 56px rail instead of becoming the slide-in drawer) and the model-selection menu rendered clipped, its first 56px of each name hidden behind the rail.

## Decision

**Dual-anchor CSS.** Every layout rule now targets both runtimes. Fork frontends keep the `data-shell-*` anchors; released frontends are anchored structurally:

- The frame is the unique element carrying the overlay layer as a direct child — `:has(> [data-shell-overlay])` — the overlay layer is a direct frame child in both runtimes, and it replaces `data-shell-frame` for frame-level rules (the single-column grid override that removes the core's collapsed rail).
- Columns are identified by the `data-slot` render site directly inside each column (`:has(> [data-slot='sidebar'|'conversation'|'details'])`).
- Open/closed transitions are probed at the html level — `:not(:has([data-sidebar-collapsed]))` and the details equivalent — which relies on the two state attributes staying frame-exclusive, which they are in every released frontend.

**No nested `:has()`.** Chrome 151 rejects nested `:has()` as an invalid selector and silently drops the whole rule; the first grid-override attempt (`:has(> :has(> [data-slot=…]))`) was dropped exactly this way while the stylesheet's other rules kept working, which made the failure look app-shaped. A regression test bans `:has(> :has(` and `:has(:has(` in the stylesheet; single-level `:has(> …)` and `:not(:has(…))` remain valid and are the only forms used.

**The details push page is plugin-owned.** The core column solver keeps a 640px center floor, so below roughly 996px of viewport it can never render the details column open — on a phone `data-details-collapsed` therefore never flips, and an attribute-driven visibility or history mechanism is a dead signal there (true on the fork runtime as well, where the same solver shipped). The overlay now owns the pushed-page open state: the overflow's open entry sets it and mirrors it as `<html data-chaos-details-open>`, which drives the sheet visibility and the nav-bar back/menu states. The layout store is written alongside (`openDetails` / `closeDetails`) so a wide runtime restores the real column on re-widening. The sheet starts below the 44px nav bar so the core details header's own close button stays reachable, and the overlay intercepts that button to close the page. One history entry is pushed per open and removed on any in-page close or unmount; the system back button's popstate and the nav back button share the single close path.

## Alternatives considered

**Patch the released dsh or run the service from the fork.** Rejected by the owner: the plugins must be compatible with the installed dsh, not the other way around.

**Drive the sheet from the layout store.** Infeasible: the store is not exposed outside ui-layout, and the frame's only external signal is the post-solve grid, which forces details to 0 on narrow viewports by construction.

**Keep the 0.1.3 attribute-driven details mechanism as a fallback.** Dead on every released runtime because of the solver floor, so it was replaced rather than carried as a second source.

## Consequences

The plugin renders fully on both the fork and released frontends without configuration. The details pushed page now opens and closes on phones where it could not before — a genuine behavior fix, verified end-to-end. The cost: the sheet and nav-bar back/menu state key off a plugin-owned attribute in addition to ui-layout's, recorded in the README known limitations, and the two state attributes must keep staying frame-exclusive for the html-level probes to remain sound.

## Testing

`pnpm exec vitest run packages/extensions/chaos-mobile` — 94/94, including the new state-driven details-history tests (open from the overflow, close through the core close button, system back, double-popstate no-op) and the nested-`:has()` stylesheet ban. A Playwright iPhone 13 (390x660) pass against a real 0.1.2-rc.1 boot with the full profile passed 17/17: single-column grid, off-screen fixed drawer, unclipped model menu, session selection, details pushed page open plus both close paths, desktop three-column regression, no console errors and no 4xx.
