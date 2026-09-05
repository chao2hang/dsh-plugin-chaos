# `@deepseek-ai/dsh-plugin-chaos-upload`

English | [中文](README.zh.md)

Document upload for the DeepSeek Harness Web composer. The plugin stores browser-picked non-image files inside the session workspace over its own Typert Remote, appends an `@path` mention to the draft, and marks each referenced upload at the model's pre-step boundary. It is enabled by the Chaos bundle; the composer's mobile paperclip (chaos-mobile) offers its button, desktop paste and drop feed it directly, and it renders no UI of its own.

## Behavior

The browser half provides the `chaosUpload` service: one `uploadAndMention(sessionId, file)` operation. It base64-encodes the file, sends it to the Host through the `chaosUpload/upload` Remote, and inserts `@uploads/<name>` at the end of the session's draft through the scoped `slash/input-insert-text` event. When the input machine refuses the insertion (a concurrent edit won the span revision), the upload still succeeds and the caller notifies the manual reference.

Desktop files reach the service through capture-phase document listeners: pasting into the composer or dropping anywhere on the page with at least one non-raster file routes the batch — raster images join the draft-image rail, everything else uploads. The capture phase runs before the core's image-only intake, so an intercepted event never reports "unsupported image"; a text-only or raster-only paste keeps the core flow untouched. A mixed paste's accompanying text is dropped.

The Host half admits one upload by decoding canonical base64, enforcing the byte cap, reducing the declared name to a safe bare basename, and writing the bytes into `<workspace>/<dir>/` under a collision-free name (`report.pdf`, `report-2.pdf`, …). The write uses `wx`, so concurrent uploads of the same name never overwrite one another.

Before a model step, the plugin scans the user's own messages for `@<dir>/...` tokens, confirms each names an existing file inside the session workspace, and appends one message such as:

`<workspace-reference path="uploads/report.pdf" kind="file" />`

The marker carries no file content. The model reads a referenced path only through a tool available in the session; invalid, missing, or non-existent paths stay ordinary user text. Tokens outside the configured directory are not scanned — that surface belongs to chaos-at-file when enabled.

## Configuration

```yaml
- id: chaos-upload
  name: '@deepseek-ai/dsh-plugin-chaos-upload'
  config:
    dir: uploads
    maxFileBytes: 20971520
    markers: true
```

- `dir` — workspace-relative upload directory, created on demand. Must be a relative, forward-slashed path of usable segments; rejected at load otherwise.
- `maxFileBytes` — hard cap on one upload's decoded byte length (default 20 MiB).
- `markers` — set `false` to stop the pre-step marking while keeping uploads.
- `maxAgeDays` — retention: a stored upload is deleted once its file is older than this many days; `0` (default) keeps uploads forever. The sweep covers every workspace known to session persistence, deletes flat files only, and runs every `sweepIntervalMinutes` (default 60) with a prompt boot pass.
- `dryRun` — log the deletions a sweep would perform without deleting.

A deleted upload degrades gracefully: the pre-step marker validation fails and the `@path` token stays ordinary user text.

## Model Experience

### Workspace reference markers

#### What the model sees

No fixed prompt section. A valid user-typed or inserted `@<dir>/...` token contributes one short `workspace-reference` marker at the next model step. The original token remains in the user's text.

#### Token effect

Variable: one short marker per valid distinct uploaded reference in the claimed user messages. Uploaded bytes cross the RPC once inbound and never enter a model request.

#### KV Cache effect

No stable prefix changes. A changed reference marker changes that step's user-message suffix only.

## Known Limitations and Deferred Work

- Uploads ride the JSON RPC as base64, so one upload costs roughly 1.37× its byte length in request size; deployments wanting larger documents should raise `maxFileBytes` deliberately.
- The marker validates existence at step preparation, not continued access by a later tool call, and scans only tokens under the configured directory.
- With chaos-at-file also enabled, both plugins mark the same `@<dir>/...` token once each; disable one marker surface if the duplication matters.
- The browser half resolves the `chaosUpload` service per render, so a late-loading plugin appears on the composer's next re-render rather than immediately.

**Runtime invariant:** No companion is published. Stored uploads live in the workspace through the fs service and are re-validated by the marker at step preparation; the browser half resolves the `chaosUpload` service per render and holds no cross-event state.
