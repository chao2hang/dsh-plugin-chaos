# Agent Note: mobile model selector viewport

Status: implemented

English | [中文](2026-08-23-mobile-model-selector-viewport.zh.md)

## Problem

The composer model popup was positioned relative to its trigger. On a narrow mobile viewport, sibling composer controls could clip that trigger and place a wide model list beyond the visible page.

## Decision

The model popup reads `visualViewport.width`. When that visible width is at most 600px, it receives a fixed viewport class with safe-area-aware composer offset and a viewport-relative height cap. This detects mobile Chrome even when its layout viewport remains desktop-sized. The desktop trigger-relative menu remains unchanged.

## Alternatives considered

**Use a CSS media query on layout width.** Rejected: mobile Chrome keeps a desktop-sized layout viewport, so the query would miss the only browser the bug reproduces on.

**Clamp the menu to the trigger's page position.** Rejected: sibling composer controls can clip the trigger itself, so any trigger-relative anchoring inherits the bug.

## Consequences

Every model row remains inside the mobile viewport and scrolls inside the popup when necessary. The menu no longer depends on the clipped trigger position on mobile.
