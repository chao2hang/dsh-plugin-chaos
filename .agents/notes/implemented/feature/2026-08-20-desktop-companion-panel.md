# Agent Note: Docked desktop workbench for workspace review

Status: implemented

English | [中文](2026-08-20-desktop-companion-panel.zh.md)

## Problem

Desktop Web users need a workspace surface that remains available alongside the active conversation. The reference interaction reserves main-content space for a resizable right workbench and an optional bottom dock, then groups workspace navigation, source review, command output, browser work, and task status into independently selectable views.

## Decision

`@deepseek-ai/dsh-plugin-chaos-desktop-panel` mounts its workbench in ui-layout's additive `shell.overlay` slot. A top-right control cluster opens an independently resizable right panel and bottom dock; their reserved screen area is reflected through root CSS variables. Each dock keeps its own selected and open tab state in per-session browser storage. The right dock can split into two independently tabbed panes with a draggable divider.

The workbench provides an expandable and searchable server-rooted file tree, text upload, editable text preview with HTML sandbox mode and download, Git status/diff/history review, persistent Bash PTYs isolated by session and visible pane, with bounded replay and reconnect grace, an isolated browser with navigation history, current-session jobs with lifecycle, producer, timestamp, and detail, and a message composer. Workspace routes require same-origin requests; file reads and writes use `/api/chaos-desktop/file` with path containment checks. Git mutations use structured workspace-contained paths for stage, unstage, discard, commit, and local branch checkout. The Web bundle mounts the plugin through its `chaos-desktop-panel` row.

The browser terminal owns a separate WebSocket registry over the subprocess PTY primitive. It derives the selected session cwd server-side, keeps bounded replay, serializes writes, and keys each PTY by session and workbench pane, requires a loopback same-authority upgrade unless the request is authenticated, and ends shells after reconnect grace or plugin teardown.

## Alternatives considered

- **A narrow overlay sidebar** — rejected because it does not reserve screen width or provide the workbench hierarchy used by the reference interaction.
- **Replacing ui-layout's root frame** — rejected because the additive `shell.overlay` slot preserves existing layout ownership and mobile behavior.
- **Calling the Agent-owned PTY service from the browser** — rejected because its ownership, lifecycle, and polling-only API do not authorize or transport browser interaction.

## Consequences

The workbench stays independent from conversation navigation and can be hidden at any time. Users can inspect and edit bounded workspace files, review Git changes, and keep two right-side views visible at once.

Host routes resolve a selected live session to its immutable `cwd` and use the Web server directory only when no workspace is present. Terminal escape-sequence emulation, terminal resize after connection, Git history mutations, and plugin-defined tab registration remain deferred.
