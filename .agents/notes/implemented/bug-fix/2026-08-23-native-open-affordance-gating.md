# Agent Note: Gate every native path-open affordance on the reported capability

Status: implemented

English | [中文](2026-08-23-native-open-affordance-gating.zh.md)

## Problem

On a Linux Host without a usable desktop (no `DISPLAY`/`WAYLAND_DISPLAY`, no `xdg-open` binary), clicking a file path in a chat tool row still fired `host.openPath`. The spawn failed with `ENOENT`, and the error reached the dialog doubled — `path open failed: path open failed: spawn xdg-open ENOENT` — because the gateway wraps once (`openTarget`) and the client runtime's `workspaces.openPath` wraps again. The Settings page had the same hole one layer up: `settings.describe` reported `hasDocument` from the provider alone (`documentPath !== undefined`), so the "open configuration file" button rendered and failed identically. Every other surface (deliverables, preset locations, workspace browser) already consulted `host.describe.canOpenPath`; these two simply bypassed it.

## Decision

- `ui-tool`: `ToolCallOwnerProps.openFile` is optional. `ToolCallTree` derives `canOpenPath` from its injected host-description hook and omits the opener when the Host does not advertise one; rows already render `filePath` as plain text when no opener currency arrives, so the dead affordance disappears without touching any row.
- `dsh-host-apiproxy`: `settings.describe.hasDocument` requires `canOpenPaths()` in addition to the provider document. The native handoff is that flag's only consumer, and the agent-preset roster draws the same line with `canOpenPaths()` today.
- The e2e lanes that click read-summary links (`seeded-history`, `navigation-panes`) pin `nativeOpen: true` through the shared `native-open.overlay.yml`, matching the existing `produced-files.overlay.yml` pattern.

## Alternatives considered

**Wrap or localize the failure message instead of hiding the control.** Rejected: the click could never succeed on such hosts, so every click would keep manufacturing a guaranteed-failure dialog.

**A new extension seam letting another plugin override the opener.** Deferred: no current consumer needs to replace `xdg-open`; the capability flag plus the platform check already decide reachability, and a seam without an owner would be speculative.

## Consequences

- Headless deployments show tool-row paths as inert text and hide the settings document action instead of failing per click.
- Deployments whose detection misleads (a container with `DISPLAY` set but nothing to see) should set the gateway's `nativeOpen: false`; that now also covers the two surfaces fixed here.
- The client-side double prefix remains when an open genuinely fails on a capable host (`workspaces.openPath` re-wraps the server message); removing it churns wire-facing snapshots for cosmetic gain and stays deferred.
