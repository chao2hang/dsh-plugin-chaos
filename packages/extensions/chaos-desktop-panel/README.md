# `@deepseek-ai/dsh-plugin-chaos-desktop-panel`

English | [中文](README.zh.md)

A desktop workbench for the DeepSeek Harness Web GUI, selectively ported from the MIT-licensed [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) interaction model.

## Purpose

The workbench has reference-style controls at the upper right for a width-reserving right panel and an optional bottom dock. Both can be opened independently; drag or focus a resize divider and use its arrow keys. The right panel is constrained to 320–760 px and the bottom dock keeps 160 px of usable height. State is persisted per selected session in browser local storage.

The right and bottom workbench tabs provide an expandable, searchable workspace file tree with text upload, editable text-file tabs with HTML sandbox preview and download, Git review, persistent Bash PTYs isolated by session and visible pane, with bounded replay and reconnect grace, an isolated browser with history navigation, the current session's background jobs with lifecycle, producer, timestamp, and detail, and an assistant message composer. Host routes require same-origin requests, resolve each selected live session to its immutable `cwd`, reject requests naming an unknown or workspace-less session, and use the Web server directory only when a request names no session.

The embedded browser accepts non-local HTTP/HTTPS addresses only and runs with an iframe sandbox and `no-referrer` policy.

## Composition

The host half registers same-origin routes on `webServer`. The browser half mounts `DeskPanel` into ui-layout's `shell.overlay` slot. The Chaos Web bundle enables the plugin through the `chaos-desktop-panel` row.

## Terminal Configuration

The optional `terminal.argv`, `terminal.reconnectGraceMs`, `terminal.transcriptBytes`, and `terminal.terminationGraceMs` Cordis settings select the process and bound reconnect/replay retention and subprocess termination grace. Invalid types or values stop plugin loading. The default argv is `/bin/bash --noprofile --norc -i`.

## Model Experience

None. This browser-only workbench does not add model-visible instructions, tools, tokens, or KV-cache inputs.

## Known Limitations and Deferred Work

The terminal remains process-local: it survives a browser reconnect within its 30-second grace period but not a DSH restart, and it uses a plain streamed transcript rather than an escape-sequence emulator. Git review supports bounded file stage/unstage/discard, staged-change commits with bounded messages, local branch switching, and a 30-entry history. Escape-sequence emulation, terminal resize after connection, Git history operations, revert/cherry-pick, and plugin-defined workbench tabs remain deferred.
