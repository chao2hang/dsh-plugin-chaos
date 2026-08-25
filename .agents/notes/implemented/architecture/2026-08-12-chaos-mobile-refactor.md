# Agent Note: Refactor chaos-mobile from CSS hijack to iOS-style mobile presentation

Status: implemented

English | [中文](2026-08-12-chaos-mobile-refactor.zh.md)

## Problem

The `chaos-mobile` plugin adapted the desktop layout for mobile through 22 `[class*=...]` selectors targeting CSS-module hashed class fragments and 37 `!important` overrides. Any rename in ui-layout's AppFrame CSS modules would break mobile entirely. Popups were globally hijacked via `[role='dialog'], [role='menu'], [role='listbox']` CSS overrides, fighting the JS portal positioning logic that still ran underneath. There was no navigation model (details were a full-screen overlay with a floating close button), no sheet interaction patterns (grabber, detent, drag-to-dismiss, focus trap), and hover-driven affordances (Tooltip, pointer-grace, hover-reveal) were unreachable on touch devices.

## Decision

Three coordinated changes across two client packages and the plugin:

1. **ui-layout publishes stable layout anchors**: AppFrame emits `data-shell-column="sidebar|center|details"`, `data-shell-handle`, and `data-shell-frame` on its structural nodes. These are documented as a contract: renaming or removing them requires a coordinated chaos-mobile update. Tests assert their presence and state transitions.

2. **ui-primitives opens a SurfacePresentation seam**: a module-level store (`useSyncExternalStore`) lets Modal, Menu, and Tooltip ask whether to render inline (desktop) or as a bottom sheet (mobile). The default is inline with no sheet presenter, so desktop behavior is unchanged. When `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` is called, Modal and Menu delegate their content to the presenter (which owns backdrop, grabber, detent, drag-to-dismiss), while Tooltip suppresses its bubble. The store is module-level rather than React context because Modal and Menu portal to `document.body` — a context provider in the React tree cannot reach them. All three emit stable `data-surface` attributes.

3. **chaos-mobile becomes a thin mobile skin**: `MobileOverlay` calls `setSurfacePresentation` on mount (mobile viewport) and `resetSurfacePresentation` on desktop/unmount. `MobileSheet` provides a token-based glass sheet with an accessible grabber that settles between medium and large detents before a downward drag dismisses it; it retains scroll lock, focus trapping, and reduced-motion behavior. `MobileNavBar` is a 44pt translucent bar replacing the floating hamburger and close button — CSS driven by `data-details-collapsed` switches the left button between menu toggle and back. `mobile.css` targets only stable `data-shell-*` attributes: zero `[class*=]` selectors for columns/handles (one remains for `headerUtilities`, a known limitation).

Additional mobile interactions: `useKeyboardInset` tracks the on-screen keyboard via the Visual Viewport API; `useEdgeSwipe` provides edge-swipe-to-open-drawer; each non-blank Session row reveals its existing Rename/Fork controls after a right swipe or Archive after a left swipe, without executing an action or opening the Session; `history.pushState` integration makes the system back button close the details push-page (iOS back-navigation model).

## Alternatives considered

### Why not replace the root slot?

Registering chaos-mobile's own AppFrame into the `root` single slot at a lower priority would shadow ui-layout's AppFrame, but the shadowed entry cannot re-declare its child slots (`sidebar`, `conversation`, `details`, `shell.overlay`) — `SlotCore.register` throws `slot "sidebar" is already declared` because the first registrant already owns those declarations. Shadowing without re-declaring means the shadow component cannot call `renderSlot('sidebar', ...)` because it has no render authorization. This path is blocked at both the type and runtime level.

### Why not use a CSS-only approach with stronger selectors?

Strengthening the `[class*=]` selectors with more specific matches would still break on any CSS-module hash change. The root fragility is that CSS-module class names are an implementation detail of the owning package, not a contract. Stable data attributes are the correct contract surface.

### Why self-build MobileSheet instead of using vaul / react-modal-sheet?

The sheet must integrate with ui-primitives' `SurfacePresentation` seam (accepting `children`, `onClose`, `title` as props), follow the repository's `--dsw-*` token system, respect `prefers-reduced-motion`, and avoid introducing a React version or styling-system dependency the repo does not carry. The sheet's scope is bounded: grabber, two detents, drag-to-dismiss, focus trap, scroll lock — a ~120-line component is the right size.

### Why a module-level store instead of React context for SurfacePresentation?

Modal and Menu portal their content to `document.body` via `createPortal`. The `shell.overlay` slot where chaos-mobile's MobileOverlay lives is a sibling of the conversation/sidebar columns, not an ancestor of the portaled content. React context cannot reach across portal boundaries without a provider at the document-body level, which no plugin owns. A module-level store with `useSyncExternalStore` reaches every consumer regardless of tree position.

## Consequences

- chaos-mobile's `mobile.css` went from 322 to 191 lines; `[class*=]` selectors from 22 to 1 (headerUtilities, known limitation); `!important` from 37 to 23.
- Desktop behavior is provably unchanged: all 575 pre-existing ui-layout + ui-primitives tests pass without modification; the 8 new SurfacePresentation tests assert that default inline mode produces identical DOM.
- The `SurfacePresentation` seam is a capability seam (Service Definition in ui-primitives, Provider in chaos-mobile): removing chaos-mobile from the web profile restores desktop with zero code changes.
- One known limitation remains: `[class*='headerUtilities']` has no stable data anchor in ui-conversation yet. Adding one is a coordinated upstream change deferred to future work.
- `history.pushState` integration owns the back-button for the details push-page; a future routing plugin would need to coordinate ownership.
