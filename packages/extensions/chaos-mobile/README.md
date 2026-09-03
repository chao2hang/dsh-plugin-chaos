# `@deepseek-ai/dsh-plugin-chaos-mobile`

English | [中文](README.zh.md)

Mobile adaptation plugin for the DeepSeek Harness Web GUI.

## Purpose

At widths below 768px, this plugin adapts the existing layout without replacing its state owner:

- A 44pt `MobileNavBar` replaces the floating hamburger and close buttons: left shows a menu toggle (or a back button while the details panel is open), center holds the current session title and agent mode, and right holds a single overflow button.
- The sidebar becomes a slide-in drawer with a backdrop, opened via the nav bar's menu toggle.
- The details column becomes a full-screen pushed page with the nav bar's back button closing it.
- `MobileSheet` presents Modal and Menu as an iOS-inspired glass sheet: its accessible grabber expands or collapses medium and large detents before a downward drag dismisses it; it also provides scroll lock and a focus trap through ui-primitives' `SurfacePresentation` seam.
- `Tooltip` suppresses its bubble entirely on mobile (no hover on touch devices).
- Safe-area padding, dynamic viewport height, and 44px minimum touch targets improve touch use.
- The Visual Viewport API continuously tracks visible height and vertical offset so the composer remains aligned with the keyboard during mobile viewport panning.
- The composer includes an image-attachment button that uses the existing admission, preview, limit, and removal flow.
- CSS targets stable `data-shell-column`, `data-shell-frame`, `data-shell-handle`, and `data-conversation-session-header` anchors — no `[class*=]` hashed-class selectors.

Desktop widths retain ui-layout's unmodified three-column frame, drag handles, and column solver.

## Composition

The client plugin adds `MobileOverlay` to ui-layout's `shell.overlay` slot and `AttachmentButton` to `conversation.input.left`. It declares `slots`, `conversation`, `layout`, and `ui-primitives` as required services. The overlay registration injects `toggleSidebar` and `closeDetails` callbacks from `ctx.layout`. On mount, the overlay calls `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` to activate the `MobileSheet` renderer for all Modal/Menu/Tooltip instances; on unmount or desktop, it calls `resetSurfacePresentation()`.

## Configuration

No configuration. Remove the `chaos-mobile` row from the Web profile's `cordis.patch.yml` to use the desktop layout without these mobile adaptations.

## Model Experience

None, as this browser-only plugin registers neither model context nor tool schema.

#### KV Cache effect

The plugin changes no model request, so it neither adds tokens nor changes KV Cache reuse.

## Known Limitations and Deferred Work

- **Layout selectors**: the drawer and sheet CSS targets ui-layout's stable data attributes (`data-shell-frame`, `data-shell-column`, `data-sidebar-collapsed`, `data-details-collapsed`). Changes to those emitted attributes require a coordinated update.
- **History integration**: the details push-page does not yet intercept `history.pushState` for system back-button support. This is planned for a follow-up.

**Runtime invariant:** No companion is published. The package contributes browser presentation only; ui-layout owns the panel state and its observable state transitions.
