---
description: "Workspace @path references for the DeepSeek Harness Web composer: an @ picker over a bounded session-workspace index, a referenced-path dock, filename filter settings, and existence-only pre-step markers for the model."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-at-file

English | [中文](README.zh.md)

## Summary

Type `@` in the Web composer to search the active session's workspace and insert a plain-text `@path` reference into the draft. The picker ranks basenames for a plain query, matches path segments in order when the query contains a slash, and offers a shallow-first browse while the query is empty; ArrowRight descends into a highlighted directory. A strip above the composer lists every drafted reference with an open action and one-click removal, and Settings → File mentions turns the surface on or off, keeps pasted `@` tokens as plain text, and manages global or per-workspace filename filters. Before each model step the Host re-validates every drafted path against the workspace and appends one existence-only marker per valid reference, so a user can point the agent at a file without pasting its content.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the Host service and its browser half as one `cordis.yml` row in a composition that loads the Web surface; the picker appears in the composer once both halves are active.

### When to choose it

Choose this plugin when sessions run on a local workspace directory the Host can walk and users should reference files by path instead of pasting content. The index reads the session's `cwd` through `node:fs`, so a deployment whose sessions live on remote or virtual filesystems needs a matching index source. The Web bundle's built-in `ui-reference` row registers its own `@` source named `reference`; the two sources coexist, so disable that row in a profile overlay when the composer should offer only this picker.

### Minimal configuration

```yaml
- id: chaos-at-file
  name: '@deepseek-ai/dsh-plugin-chaos-at-file'
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules', 'dist']
```

| Field | Default | Meaning |
|---|---|---|
| `maxIndexedFiles` | `5000` | Hard cap on indexed entries per workspace; the walk stops at the cap |
| `ignoreDirs` | the built-in list | Directory basenames the walk never enters; `[]` indexes every directory |

`maxIndexedFiles` must be a positive safe integer and every `ignoreDirs` entry a non-empty directory basename; both are validated at plugin activation. The fields come from the Host `Config` schema in [`src/runtime.ts`](src/runtime.ts).

### The picker surface

Typing `@` opens the picker: a plain query matches basenames only, a query containing a slash matches path segments in order, and an empty query browses shallow-first with directories ahead of files at the same depth. The browser fetches the workspace index once per session, keeps it hot for 30 seconds, filters it locally per keystroke, and shows at most 50 rows. Picking an entry inserts the plain-text token `@<relative path>` (a trailing slash marks a directory); the referenced-path strip above the composer lists one removable row per drafted token — click the path to open it on the Host, click × to drop the token from the draft.

### Markers before a model step

Before each model step, the plugin scans the user's own claimed messages for `@path` tokens, skips the ones the user pasted while paste-ignoring is on, and resolves each remaining distinct token inside the session workspace. A token that is relative, exists, and does not escape the workspace appends one user message such as:

```markdown
<workspace-reference path="docs/spec.pdf" kind="file" />
```

The marker carries only the path and its kind — no file content and no directory listing; a directory reference uses `kind="directory"`. Absolute, missing, or workspace-escaping tokens stay ordinary user text, and the model reads a referenced path only through a tool available in the session. Pasted `@` tokens carry a zero-width marker in the browser; the Host strips it from the message text before the model sees it.

### File mention settings

Settings → File mentions owns the live `chaos-at-file` settings namespace: the enable switch (hides the picker, dock, and marking when off), the pasted-`@` policy, global filename filters, and per-workspace filter additions. Filter rules match basenames only, as exact names or regular expressions with independent case settings, and a filter change invalidates the browser's cached index before the next lookup. The index always omits the built-in metadata files (`desktop.ini`, `Thumbs.db`, `.DS_Store`) until the settings section replaces that list.

### Mobile layout

On screens up to 560px wide the picker stays inside the viewport, reference rows use the composer's content width, and delete, filter, and settings controls keep 36–44px touch targets. Long filenames wrap in picker rows; a reference row truncates only its displayed label, never the inserted path.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is one Cordis plugin with two faces: the Host half default-exports the `AtFileRuntime` service (`ctx.chaosAtFile`, wire namespace `chaosAtFile`) and the browser half ships as `./client`, discovered through the package manifest's `dsh.client` declaration. The Host owns the durable settings section, answers the picker's index search over a generated Typert Remote, and appends references at the `agent/pre-step` boundary; the browser owns the picker source, the referenced-path dock, the settings page, and the per-session index cache. The index walk streams one directory entry at a time, follows file and directory symlinks without re-entering an ancestor, skips unreadable directories with a warning, and stops at the configured cap.

### Source map

| File | Role |
|---|---|
| [`src/runtime.ts`](src/runtime.ts) | `Config` schema, `chaosAtFile` service, settings-section registration, pre-step wiring |
| [`src/files.ts`](src/files.ts) | Bounded streaming workspace walk with symlink-cycle guard |
| [`src/mention.ts`](src/mention.ts) | Token grammar, workspace confinement, existence-only reference messages |
| [`src/defaults.ts`](src/defaults.ts) | Built-in filter lists and the shared filter normalization |
| [`src/paste.ts`](src/paste.ts) | Zero-width paste-marker insert, detect, and strip |
| [`src/settings.ts`](src/settings.ts) | The `chaos-at-file` settings namespace schema |
| [`src/client/source.ts`](src/client/source.ts) | The `@` trigger source, per-session index cache, ranking feed |
| [`src/client/FilesDock.tsx`](src/client/FilesDock.tsx) | Referenced-path strip: open and remove one drafted token |
| [`src/client/FolderNavigator.tsx`](src/client/FolderNavigator.tsx) | ArrowRight directory navigation and paste protection |
| [`src/client/SettingsSection.tsx`](src/client/SettingsSection.tsx) | The Settings page for the namespace |
| — | No runtime invariant companion is published; every index answer is derived per call from the live filesystem, the settings section is owned by the settings provider, and the pre-step marker appends messages the agent loop itself logs — the package holds no mutable state relating two event streams, and registration disposal is proven by the HMR-safety spec. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Input-trigger pipeline](../../client/ui-input-trigger/README.md) — the `@` and `/` composer trigger service this picker registers into.
- [Built-in reference source](../../client/ui-reference/README.md) — the Web bundle's own `@` source, which composes beside this picker.
- [chaos-upload](../chaos-upload/README.md) — the sibling upload marker that validates `@uploads/...` tokens.
- [Agent pre-step boundary](../../core/agent/README.md) — the waterfall where reference markers append.

-----

<a id="model-experience"></a>
## Model Experience

### Workspace path references

#### What the model sees

No fixed prompt section or tool schema. The picker's index, ranking, filters, and dock stay browser-side; only a valid `@path` token in the user's own claimed messages appends one `chaos-at-file-mention` user message per distinct reference at the next model step, carrying an existence-only `<workspace-reference path="docs/spec.pdf" kind="file" />` marker. The original token stays in the user's text, and pasted tokens the settings ignore contribute nothing.

#### Token effect

Variable: one short marker message per distinct valid reference in the claimed user messages. The workspace index, settings, dock rows, and filtered candidates add no request tokens.

#### KV Cache effect

No stable prefix changes. A changed reference marker changes that step's user-message suffix only, so the reusable request prefix and provider cache stay intact.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits are current package constraints, not a task backlog.

- **The Host index and the session's tools must address the same workspace** — the walk reads the session `cwd` through local `node:fs`; deployments with remote or virtual filesystems need a matching provider for both.
- **The bounded index may omit entries** — the walk stops at `maxIndexedFiles`, and inaccessible or broken-link targets are skipped.
- **The default ignored-directory list is fixed at activation** — change `ignoreDirs` in the profile configuration and restart the Host; the settings-managed filename filters are the live subset.
- **Both marker surfaces can fire for one token** — with chaos-upload mounted, an `@uploads/...` token appends one marker from each plugin; disable one marker surface if the duplication matters.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
