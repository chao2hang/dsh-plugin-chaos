# `@deepseek-ai/dsh-plugin-chaos-at-file`

English | [中文](README.zh.md)

Codex-style workspace `@path` references for the DeepSeek Harness Web composer. The plugin owns its picker, reference chips, filter settings, and model-visible existence markers. It is enabled by the Chaos bundle, which disables the Web bundle's built-in `ui-reference` source so the composer has only one file picker.

## Behavior

Type `@` followed by a filename or path in the composer to search the active session workspace. The picker indexes files and directories only; it does not read file bytes. Selecting a file inserts a removable reference chip. Selecting a directory keeps completion open, and **ArrowRight** enters the highlighted directory.

Before a model step, the plugin confirms every referenced relative path remains inside the session workspace and exists. Each valid path adds a separate user message such as:

`<workspace-reference path="docs/spec.pdf" kind="file" />`

The marker carries no file content and no directory listing. The model reads a referenced path only through a tool available in the session. Invalid, missing, absolute, or workspace-escaping paths stay ordinary user text.

## Settings

**Settings → File mentions** controls the live `chaos-at-file` namespace:

- enable or hide the picker, dock, and pre-step markers;
- ignore pasted `@path` tokens by default; and
- add global or workspace-specific exact and regular-expression filename filters.

The index always omits common metadata, dependency, cache, and build-output directories. The plugin configuration can change the entry cap and this excluded-directory list:

```yaml
- id: chaos-at-file
  name: '@deepseek-ai/dsh-plugin-chaos-at-file'
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules', 'dist']
```

Filter changes invalidate the browser cache before the next lookup. Directory exclusions are validated as non-empty basenames, and `maxIndexedFiles` must be a positive safe integer.

## Mobile layout

On screens up to 560px wide, the picker stays inside the viewport, path chips use the full composer width, and delete, filter, and settings controls have 36–44px touch targets. Long filenames wrap in picker rows; reference chips truncate only their displayed label, not the inserted path.

## Model Experience

### What the model sees

The plugin contributes no fixed prompt section. A valid user-selected `@path` contributes one short `workspace-reference` marker at the next model step. The original `@path` remains in the user's text.

### Token effect

Variable: one short marker per valid distinct reference in the claimed user messages. The picker index, settings, chips, and filtered candidates add no request tokens.

### KV Cache effect

No stable prefix changes. A changed reference marker changes that step's user-message suffix only.

## Known Limitations and Deferred Work

- The Host filesystem index and the session's effective `read` tool must address the same workspace namespace; deployments with remote or virtual filesystems need a matching provider.
- The bounded index may omit entries after `maxIndexedFiles`; inaccessible and broken-link targets are omitted.
- The default ignored-directory list is fixed at plugin activation. Change it in the profile configuration and restart the Host.
