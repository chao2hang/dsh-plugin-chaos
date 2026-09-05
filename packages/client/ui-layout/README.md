---
description: "Shell frame plugin for the dsh web client: the three-column AppFrame with sidebar, conversation, details, and shell.overlay slots, the ctx.layout panel-action face, drag handles with the concession chain and narrow-viewport auto-collapse, and the theme presenter that projects ctx.theme snapshots onto the document."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-layout` is the shell every other client surface composes into: it fills the runtime-owned `root` slot with the three-column AppFrame and declares the `sidebar`, `conversation`, `details`, and `shell.overlay` child slots that navigation, chat, tool details, and frame-wide overlays register into. A plugin toggles panel geometry through `ctx.layout` (`toggleSidebar`, `openDetails`, `closeDetails`) or drags the column boundaries directly; the concession chain keeps the center column usable while windows shrink, and viewports below 1024px auto-collapse the sidebar to its 56px control rail. The package also seats the theme presenter, which projects resolved `ctx.theme` snapshots onto the document — color scheme, dark-palette attribute, alias tokens, content and code font sizes, and the browser `theme-color`. Structural nodes carry stable `data-shell-*` attributes so out-of-tree adaptations (mobile overlays) can target the layout contract without CSS-module class names.

## Table of Contents

- [Use this package](#use-this-package)
- [Panel geometry and the concession chain](#panel-geometry-and-the-concession-chain)
- [Stable layout anchors](#stable-layout-anchors)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose into this shell by registering a component into one of the four child slots; `apply` order is unconstrained, so use `ctx.slots.inject` from a later plugin. The common path is explicit: declare your slot in `children` if you own a nested seat, otherwise register into an existing one.

### Occupy the frame's slots

`sidebar` (single, root scope) receives the live column state — `collapsed` and the rendered `width` from the concession solve — and is occupied by ui-sidebar's SidebarRoot, which declares the workspace and settings seats inside it; registering there replaces the navigation column outright. `conversation` (single, session-maybe scope) spans the no-session hero and a live conversation, keeps its React identity across a session switch, and receives no owner props. `details` (single, session scope) stays mounted at zero width when closed — it never unmounts on close — and `ctx.layout` owns whether it is open. `shell.overlay` (list, root scope) is a click-through floating layer above every column; entries order among themselves and opt back into pointer events, so an occupant never blocks the app underneath. Registrants obtain business data from the standard framework hooks and actions from their own inject faces; the conversation owner share is empty, while the sidebar owner share contains only `collapsed` and `width`.

### Theme presentation

The theme presenter consumes resolved `ctx.theme` snapshots and projects them onto the document as pure DOM writes: `html { color-scheme }` for native UA chrome (scrollbars, form controls), `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, the content/UI/code font-size axes, and one owned `<meta name="theme-color">` whose content follows the computed body background. Measuring after palette and token application keeps the rendered background as the single color authority; the presenter only ever retracts what it wrote itself, and disposing it removes its metadata node with its other global writes.

-----

<a id="panel-geometry-and-the-concession-chain"></a>
## Panel geometry and the concession chain

Both panel boundaries are drag handles with pointer capture and rAF-throttled deltas; the drag base is the rendered (concession-clamped) width captured at gesture start, so grabbing a squeezed panel does not jump it back to the stored preference, and track-level transitions pause for the whole gesture. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill. Drag writes clamp into the contract ranges — sidebar 264–420px (default 280), details 300–520px (default 360) — and never cross the open/closed line; the preference IS the width, so closing a panel forgets its drag width and reopening restores the contract default. A closed sidebar retains its 56px control rail while details closes to zero width (the subtree stays mounted).

The concession chain is fixed by contract: keep the center column at or above 640px by shrinking details toward its minimum, then auto-closing it; the sidebar never concedes, and the center absorbs any remaining deficit as the last resort. Auto-close derives a zero rendered width without rewriting the preferred width, so widening the window restores the panel automatically. Viewports below 1024px (the deepsuite LG breakpoint) auto-collapse the sidebar to the rail; a manual toggle there flips a `narrowExpanded` override that re-expands over the squeezed center without touching the width preference, and crossing the breakpoint in either direction drops the override.

The layout store is transient: the sidebar starts at its default width, details start closed, and the store never reads or writes `localStorage`. AppFrame tracks the frame's own box (not the window) through a rAF-throttled ResizeObserver and ignores zero-width reports. It also retains the last non-blank Session id across unselected states: selecting a different non-blank Session closes details before paint, returning to the same Session restores its unchanged width, and hero or other unselected surfaces derive a zero rendered details width without changing the stored preference.

-----

<a id="stable-layout-anchors"></a>
## Stable layout anchors

AppFrame emits stable data attributes on its structural nodes so that out-of-tree plugins can target a contract instead of CSS-module hashed class fragments:

- `data-shell-frame` — on the frame div.
- `data-shell-column="sidebar|center|details"` — on each of the three grid columns.
- `data-shell-handle` — on each drag handle (absent when the owning column is collapsed).
- `data-sidebar-collapsed` — present on the frame div while the sidebar is collapsed.
- `data-details-collapsed` — present on the frame div while the details width is zero.
- `data-dragging` — present on the frame div for the duration of a panel drag gesture.

These attributes are part of the layout contract: renaming or removing them requires a coordinated update in consumers such as chaos-mobile's `mobile.css`. Tests in `app-frame.client.spec.tsx` assert their presence and state transitions.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the solve and store wiring; the observable slot contract is covered above.

### Design notes

AppFrame decides the effective sidebar preference (collapsed rail, narrow override, or stored width) and passes it to the pure solver in `columns.ts`, which stays breakpoint-free: its output is a pure function of (viewport, preferences) with no hysteresis, which is why recovery on re-widening is automatic. The layout store (`stores.ts`) is the root entry's exclusive store — `register()` receives the factory so the framework instantiates it per entry — and `LayoutController` (`service.ts`) is the cross-plugin `ctx.layout` face: it adopts the store's bound actions through the registration's inject hook, so the face is live from the entry's first render, and reaching it unwired is a boot-order bug that throws rather than a race to tolerate. The theme presenter is a plain class applied once through the getter at plugin start and then driven by `theme/change` events — no React path.

### Source map

| File | Role |
|---|---|
| [`src/client/AppFrame.tsx`](src/client/AppFrame.tsx) | The three-column frame, drag handles, slot render decisions |
| [`src/client/columns.ts`](src/client/columns.ts) | Contract-frozen geometry constants and the pure concession solver |
| [`src/client/stores.ts`](src/client/stores.ts) | The transient panel-geometry store factory |
| [`src/client/service.ts`](src/client/service.ts) | `LayoutController` behind `ctx.layout` |
| [`src/client/theme-presenter.ts`](src/client/theme-presenter.ts) | Global theme DOM applier |
| [`src/client/DocumentTitle.tsx`](src/client/DocumentTitle.tsx) | Browser-title projection from the selected session |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the shell contract is not enough.

- [Slots reference](../../../docs/subsystems/slots.md) — the composition model behind the four child slots.
- [ui-sidebar](../ui-sidebar/README.md) — the navigation column occupying `sidebar`.
- [ui-conversation](../ui-conversation/README.md) — the conversation and details occupants.
- [ui-theme](../ui-theme/README.md) — the theme service whose snapshots the presenter projects.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell does not remember or anchor; they are current package constraints.

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The shell viewing-state store behind ctx.layout emits no cordis events; clamp/prune/concession-chain sequencing is asserted directly by this package's columns and service specs.
