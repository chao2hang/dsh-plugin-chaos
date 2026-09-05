# Agent Note: Session log download sidebar menu

Status: implemented

English | [中文](2026-08-24-session-log-download-sidebar-menu.zh.md)

## Problem

The Session log download control occupied the conversation header even though it operates on the selected Session's persisted archive.

## Decision

The selected non-blank Session's sidebar overflow menu includes **Download log**. The action calls the existing Session log download controller. The header keeps the Session-scoped result dialog but no longer renders a download button.

## Alternatives considered

**Keep the header button.** The control remains visually separate from the other Session management actions and competes for limited header space.

**Add the action to every Session menu.** Downloading follows the current Session selection, so limiting the entry to the selected row avoids an ambiguous target.

## Consequences

The archive action is grouped with Session management controls. Slash-command export continues to share the same controller and dialog.
