# Agent Note: Mobile overlay actions follow the layout service

Status: implemented

English | [中文](2026-08-22-mobile-overlay-layout-actions.zh.md)

## Problem

`chaos-mobile` rendered the menu and details-close controls through `shell.overlay`, but it sampled `ctx.get('layout')` once and placed the result on `window.__chaos_layout`. The plugin did not require `layout`, so composition order could leave the global unset permanently. Both controls then silently ignored presses.

## Decision

`chaos-mobile` requires `layout` and injects narrow `toggleSidebar` and `closeDetails` callbacks into its `shell.overlay` entry. `MobileOverlay` invokes those callbacks directly. `ui-layout` remains the owner of panel state, and its `data-sidebar-collapsed` and `data-details-collapsed` attributes remain the source for drawer, backdrop, and details-close visibility.

## Alternatives considered

**Keep the window bridge.** A global mutable reference bypasses Cordis dependency ordering, has no typed owner at the rendering entry, and can be absent while the controls remain visible.

**Give chaos-mobile a second panel store.** A duplicate store would need to synchronize every transition with `ui-layout` and could diverge from the AppFrame attributes that CSS already consumes.

**Pass the whole layout service to the component.** The overlay needs only two commands. Injecting those callbacks keeps the component independent of unrelated layout operations while preserving the service as their implementation owner.

## Consequences

Mobile button clicks now reach the same service actions as the desktop shell, regardless of plugin mount order. A jsdom component test exercises the menu, backdrop, and details-close clicks, and a composition test verifies the injected callbacks invoke the current `ctx.layout` actions. Future panel actions require an explicit overlay callback and test rather than another browser global.
