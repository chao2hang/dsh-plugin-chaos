---
description: "The browser-side mobile adaptation for the Web GUI on phones: drawer navigation, a 44px nav bar, bottom sheets, touch targets, keyboard tracking, and the attachment chooser below the 768px breakpoint."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-mobile

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-mobile` adapts the Web GUI's existing three-column layout for phones without replacing its state owner. On a mobile viewport it overlays a 44px navigation bar, turns the sidebar into a slide-in drawer and the details column into a full-screen pushed page, and presents Modal and Menu as draggable bottom sheets with medium and large detents. Touch use improves through 44px targets, safe-area padding, Visual Viewport tracking that keeps the composer aligned with the keyboard, and a three-action attachment chooser for camera, images, and documents. Desktop widths keep ui-layout's unmodified frame; the plugin has no configuration and no model-facing surface.

## Table of Contents

- [Use this package](#use-this-package)
- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin with the Web profile when the GUI must be usable on a phone; keep it out for a desktop-only layout. The mobile shell owns the viewport below 768px width and on short landscape viewports (height under 500px, where the three-column grid cannot fit); the overlay marks `<html data-chaos-mobile>` so every CSS rule keys off one measured decision. At those widths the plugin adapts the existing layout without replacing its state owner:

- A 44px `MobileNavBar` replaces the floating hamburger and close buttons: left shows a menu toggle (a back button while the details panel is open), center shows the current session title, and right holds a single overflow button.
- The sidebar becomes a slide-in drawer with a backdrop, opened by the nav bar's menu toggle or a left-edge rightward swipe, and closed by the backdrop, the toggle, or a leftward swipe.
- The details column becomes a full-screen pushed page; the nav bar's back button and the system back button close it through one shared history entry the overlay owns.
- `MobileSheet` presents Modal and Menu as an iOS-inspired glass sheet: its accessible grabber expands or collapses medium and large detents before a downward drag dismisses it; it also provides scroll lock and a focus trap through ui-primitives' `SurfacePresentation` seam.
- `Tooltip` suppresses its bubble entirely on mobile (no hover on touch devices).
- Safe-area padding, dynamic viewport height, and 44px minimum touch targets improve touch use.
- The Visual Viewport API continuously tracks visible height and vertical offset so the composer remains aligned with the keyboard during mobile viewport panning.
- The composer's paperclip opens a three-action chooser: camera capture, image library, and document upload. Every pick enters the conversation's unified attachment intake — `createDrafts` turns images into previewed image drafts sent with the prompt and documents into file drafts whose background upload starts immediately, `addAttachments` stages them in the composer, and a refusal releases the drafts back. The document picker keeps a document-only `accept` (`application/*,text/*`) — a bare file input makes several mobile browsers open the camera/gallery sheet instead of the file picker.
- The overflow button opens a sheet with the entries that have no other mobile chrome: new session, open details, open the tools panel, switch between the chat and trajectory views, and the current session stats.
- The desktop settings modal renders as a dedicated mobile page: while it owns the surface, the nav bar shows a 设置 title and its back button closes the page.
- CSS targets stable `data-shell-column`, `data-shell-frame`, `data-shell-handle`, and `data-conversation-session-header` anchors — no `[class*=]` hashed-class selectors.

Desktop widths retain ui-layout's unmodified three-column frame, drag handles, and column solver; the overlay renders nothing and resets surface presentation to inline.

### No configuration

The plugin has no Config interface. Remove the `chaos-mobile` row from the Web profile's `cordis.patch.yml` to use the desktop layout without these mobile adaptations.

-----

<a id="composition"></a>
## Composition

The node half's `apply` is empty — it gives the Loader a host-side row while the browser half ships through `exports["./client"]`. The browser half declares `slots`, `conversation`, `layout`, `uiWorkspace`, and `sessions` as required services and adds `MobileOverlay` to ui-layout's `shell.overlay` slot plus the `AttachmentButton` (id `chaos-mobile-attachment-picker`) to `conversation.input.left`. The overlay registration injects `toggleSidebar`, `openDetails`, `closeDetails`, and `newSession` actions from `ctx.layout` and the workspace navigation; the attachment registration hands the button a `conversation` adapter — `createDrafts` and `releaseDraftAttachments` forward to the conversation controller, while `addAttachments` and `notify` resolve the session scope from the slot's session id. On mount, the overlay calls `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` to activate the `MobileSheet` renderer for all Modal/Menu/Tooltip instances; on unmount or desktop it calls `resetSurfacePresentation()`. It also injects the global mobile stylesheet for the plugin lifetime.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser-only plugin registers neither model context nor tool schema.

#### KV Cache effect

The plugin changes no model request, so it neither adds tokens nor changes KV Cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define where the mobile adaptation depends on other packages or degrades. They are current package constraints, not a task backlog.

- **Layout selectors** — the drawer and sheet CSS targets ui-layout's stable data attributes (`data-shell-frame`, `data-shell-column`, `data-sidebar-collapsed`, `data-details-collapsed`); changes to those emitted attributes require a coordinated update.
- **Sheet presentation is an optional seam** — `setSurfacePresentation` is read as an optional pair: a composition whose ui-primitives lacks the additive API degrades to inline presentation instead of rendering bottom sheets.
- **The nav-bar mode chip has no data source** — the host summary projects no per-session agent preset, so the nav bar's center shows the session title only, and the chip stays unused until a provider exists.
- **Mobile chrome copy is plugin-owned Chinese** — the nav-bar and overflow-sheet labels and the attachment chooser render fixed literals instead of the locale dictionaries.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package contributes browser presentation only; ui-layout owns the panel state and its observable state transitions.
