# `@deepseek-ai/dsh-plugin-chaos-mobile`

Mobile adaptation plugin for the DeepSeek Harness Web GUI.

## Purpose

Shadows the built-in `root` slot with a mobile-aware `ChaosAppFrame` that switches between desktop and drawer layouts at the **768px** breakpoint. On mobile (< 768px):

- **A1 Drawer sidebar**: the sidebar exits the grid and becomes a slide-in drawer with a semi-transparent backdrop. A hamburger button opens it; tapping a session or the backdrop closes it.
- **A2 Conversation layout**: the conversation column takes full width; the input area is sticky at the bottom; long titles truncate.
- **A3 Input touch adaptation**: bottom safe-area padding for the gesture bar; primary buttons have a 44px minimum touch target; control rows wrap without overlap.
- **A4 Bottom-sheet popups**: settings panels, model menus, and dropdown selectors slide up from the bottom as rounded, scrollable sheets with safe-area padding.
- **A5 Viewport adaptation**: `100dvh` for dynamic viewport height; `env(safe-area-inset-*)` for notch/home-indicator; landscape support on short screens.

At desktop width (≥ 768px), the frame renders identically to the stock `AppFrame` — same three-column grid, drag handles, and column solver.

## Composition

Register into the `root` slot at `priority: -1` to shadow ui-layout's shipped `AppFrame` (default `priority: 0`). The shadow preserves all four child slots (`sidebar`, `conversation`, `details`, `shell.overlay`). The inject hook connects the combined store's panel-action subset (`toggleSidebar`, `openDetails`, `closeDetails`) to `ctx.layout` so other plugins' panel gestures work unchanged.

## Configuration

No configuration — the plugin is active when composed. Remove the `chaos-mobile` row from the web profile's `cordis.patch.yml` to keep the stock desktop-only layout.

## Known Limitations and Deferred Work

- **Shadow coupling**: the desktop layout path mirrors ui-layout's `AppFrame` logic (copied for package independence). Upstream changes to the column solver or drag-handle behavior require a manual sync.
- **Bottom-sheet targeting**: the global CSS targets `[role='dialog']`, `[role='menu']`, `[role='listbox']`, and `[data-popup]` — popups that use non-standard markup may not transform into bottom sheets.
- **`attachPanels` access**: the inject hook casts `ctx.layout` to the concrete `LayoutController` class to call `attachPanels` (public on the class, absent from the `ILayout` interface). A main-repo change to expose this method on `ILayout` would remove the cast.
