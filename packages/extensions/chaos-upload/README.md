---
description: "Document upload into the session workspace for the DeepSeek Harness Web composer: browser-to-Host file RPC over a Typert Remote, draft @path mention insertion, age-based retention, and existence-only pre-step markers for uploaded paths."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-upload

English | [中文](README.zh.md)

## Summary

Attach non-image documents to a Web session: paste into the composer or drop files anywhere on the page on desktop, or use the mobile composer's paperclip, and the plugin stores the file inside the session workspace over its own Typert Remote and appends an `@uploads/<name>` mention to the draft. Before each model step the Host re-validates every drafted upload path and appends one existence-only marker the model can act on, so a user can hand a document to the agent without pasting its content. Raster images keep the composer's draft-image flow, and an optional age-based sweep deletes stored uploads once they grow old. The plugin renders no UI of its own; the Chaos bundle mounts it, and the mobile paperclip (chaos-mobile) offers its button.

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

Mount the Host service and its browser half as one `cordis.yml` row in a composition that loads the Web surface; the Chaos bundle inserts this row by default.

### When to choose it

Choose this plugin when sessions should receive documents as workspace files the agent reads with its own tools, instead of pasted text or draft images. Desktop paste and drop feed the service directly, and the mobile composer's paperclip offers its document action only while this plugin is mounted.

### Minimal configuration

```yaml
- id: chaos-upload
  name: '@deepseek-ai/dsh-plugin-chaos-upload'
  config:
    dir: uploads
    maxFileBytes: 20971520
    markers: true
```

| Field | Default | Meaning |
|---|---|---|
| `dir` | `uploads` | Workspace-relative upload directory, created on demand; must be a relative, forward-slashed path of usable segments |
| `maxFileBytes` | `20971520` (20 MiB) | Hard cap on one upload's decoded byte length |
| `markers` | `true` | Whether the pre-step boundary validates `@<dir>/...` tokens |
| `maxAgeDays` | `0` | Age in days beyond which a stored upload is deleted; `0` keeps uploads forever |
| `sweepIntervalMinutes` | `60` | Retention sweep cadence; the first pass runs shortly after boot |
| `dryRun` | `false` | Log the deletions a sweep would perform without deleting |

The fields come from the Host `Config` schema in [`src/runtime.ts`](src/runtime.ts).

### Upload intake

The browser half provides the `chaosUpload` service: one `uploadAndMention(sessionId, file)` operation that base64-encodes the file, sends it to the Host through the `chaosUpload/upload` Remote, and inserts `@uploads/<name>` at the end of the session's draft through the scoped `slash/input-insert-text` event. When the input machine refuses the insertion (a concurrent edit won the span revision), the upload still succeeds and the composer notifies the manual reference. Desktop files reach the service through capture-phase document listeners: pasting into the composer or dropping anywhere on the page with at least one non-raster file routes the batch — raster images join the draft-image rail, everything else uploads. A text-only or raster-only paste keeps the core flow untouched, and a mixed paste's accompanying text is dropped.

### Host admission and retention

The Host half admits one upload by decoding canonical base64, enforcing the byte cap, reducing the declared name to a safe bare basename, and writing the bytes into `<workspace>/<dir>/` under a collision-free name (`report.pdf`, `report-2.pdf`, …); the write uses `wx`, so concurrent uploads of the same name never overwrite one another. With `maxAgeDays` set, a sweep covers every workspace known to session persistence, deletes only flat files in the upload directory older than the configured age, and runs every `sweepIntervalMinutes` with a prompt boot pass; `dryRun` rehearses the deletions in the log. A deleted upload degrades gracefully: the pre-step marker validation fails and the `@path` token stays ordinary user text.

### Markers before a model step

Before each model step, the plugin scans the user's own claimed messages for `@<dir>/...` tokens, confirms each names an existing file inside the session workspace, and appends one user message such as:

```markdown
<workspace-reference path="uploads/report.pdf" kind="file" />
```

The marker carries no file content. The model reads a referenced path only through a tool available in the session; invalid, missing, or non-existent paths stay ordinary user text. Tokens outside the configured directory are not scanned — that surface belongs to chaos-at-file when enabled.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is one Cordis plugin with two faces: the Host half default-exports the `ChaosUploadRuntime` service (`ctx.chaosUpload`, wire namespace `chaosUpload`) and the browser half ships as `./client`, discovered through the package manifest's `dsh.client` declaration. The Host answers the upload RPC by storing bytes inside the session workspace, appends references at the `agent/pre-step` boundary, and runs the retention sweep on the plugin fiber's timer; the browser half mounts the Remote, provides the `chaosUpload` service, and installs the desktop intake. File content crosses the RPC exactly once, on the way in.

### Source map

| File | Role |
|---|---|
| [`src/runtime.ts`](src/runtime.ts) | `Config` schema, `chaosUpload` service, pre-step wiring, retention sweep |
| [`src/upload.ts`](src/upload.ts) | Base64 admission, name reduction, collision-free `wx` write |
| [`src/marker.ts`](src/marker.ts) | `@<dir>/...` token grammar and existence-only reference messages |
| [`src/sweep.ts`](src/sweep.ts) | Age-based retention sweep over one workspace's upload directory |
| [`src/client/service.ts`](src/client/service.ts) | The `chaosUpload` browser service: upload-and-mention, draft insertion |
| [`src/client/intake.ts`](src/client/intake.ts) | Capture-phase paste and drop listeners |
| — | No runtime invariant companion is published; stored uploads are plain workspace files re-validated by the marker at step preparation, the browser half holds no cross-event state, and registration disposal is proven by the HMR-safety spec. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [chaos-at-file](../chaos-at-file/README.md) — the sibling `@` picker and marker surface for the whole workspace.
- [chaos-mobile](../chaos-mobile/README.md) — the composer paperclip that offers the document action.
- [Chaos bundle](../chaos-bundle/README.md) — the composition that mounts this plugin.
- [Agent pre-step boundary](../../core/agent/README.md) — the waterfall where reference markers append.

-----

<a id="model-experience"></a>
## Model Experience

### Workspace reference markers

#### What the model sees

No fixed prompt section. A valid user-typed or inserted `@<dir>/...` token contributes one short `<workspace-reference path="uploads/report.pdf" kind="file" />` marker message at the next model step; the original token remains in the user's text. Uploaded bytes cross the RPC once inbound, land in the workspace, and never enter a model request.

#### Token effect

Variable: one short marker per valid distinct uploaded reference in the claimed user messages. The upload transport, retention sweep, and settings add no request tokens.

#### KV Cache effect

No stable prefix changes. A changed reference marker changes that step's user-message suffix only, so the reusable request prefix and provider cache stay intact.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits are current package constraints, not a task backlog.

- **Uploads ride the JSON RPC as base64** — one upload costs roughly 1.37× its byte length in request size; deployments wanting larger documents should raise `maxFileBytes` deliberately.
- **The marker validates existence at step preparation** — it does not prove continued access by a later tool call, and it scans only tokens under the configured directory.
- **Both marker surfaces can fire for one token** — with chaos-at-file also enabled, both plugins mark the same `@<dir>/...` token once each; disable one marker surface if the duplication matters.
- **The mobile paperclip resolves the service per render** — a late-loading plugin appears on the composer's next re-render rather than immediately.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
