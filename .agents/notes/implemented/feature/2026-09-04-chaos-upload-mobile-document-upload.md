# Agent Note: Chaos-owned mobile document upload

Status: implemented

English | [中文](2026-09-04-chaos-upload-mobile-document-upload.zh.md)

## Problem

The Web composer's upload path is image-only end to end: the browser intake validates the four raster media types, the wire prompt content carries `text | image` parts only, Host admission decodes and normalizes images, and the provider request projects `image_url` blocks. `dsh-client-ui-attachment` records "Images only" as a deferred limitation, so no core surface accepts a document. A Chaos-profile user on a phone — the profile's primary remote audience — has no way to get a PDF, spreadsheet, or archive from the device into the session workspace at all.

## Decision

`@deepseek-ai/dsh-plugin-chaos-upload` owns document upload as a standalone dual-half chaos plugin, composed by the Chaos bundle. No core package changes.

The Host half is a `TypertRemoteService` (`chaosUpload`) with one `@Remote('upload')` invocation: canonical-base64 decode, a `maxFileBytes` cap, the declared name reduced to a safe bare basename, and an atomic `wx` write into `<workspace>/<dir>/` (default `uploads/`) that numbers the original stem on collision (`report.pdf`, `report-2.pdf`). The session workspace comes from the wire `agentId` lookup; uploads into a session without a workspace directory fail loud.

The browser half provides the `chaosUpload` client service: one `uploadAndMention(sessionId, file)` operation that encodes the file, calls the Remote, and appends `@<dir>/<name>` to the draft through the scoped `slash/input-insert-text` event. The insertion targets the draft end in detect coordinates (each reference chip counts as one detect character), guarded by the input revision's span CAS, so a concurrent edit declines the insertion instead of racing it; the upload itself has already succeeded and the caller notifies the manual reference.

Desktop files reach the same service through capture-phase document listeners (`src/client/intake.ts`): a paste inside the composer card or a drop anywhere on the page carrying at least one non-raster file is routed — raster images join the draft-image rail through the conversation controller, everything else uploads. Capture phase at document is a DOM guarantee ahead of both the editor's paste handling and the image rail's drop listener, so the interception has no ordering race; a stopped drop ends the drag synthetically so the rail's overlay resets. The Host manifest registration is owned by the typert loader through the package's `./typert` export — a plugin-side `ctx.typert.register` of the same face makes every startup fail with a duplicate package face (the first deployment crash-looped exactly this way before the call was removed).

Before a model step, an `agent/pre-step` listener scans the user's own messages for `@<dir>/...` tokens, proves each names an existing workspace file, and appends one existence-only `workspace-reference` marker per valid token — the same message grammar chaos-at-file uses, scoped to the configured directory. The model reads an uploaded document with the tools its session already has; uploaded bytes never enter a model request.

chaos-mobile's paperclip button opens a three-action chooser — camera capture, image library, document upload. Images keep the existing draft-image rail; the document action routes non-image files through the service and resolves it with a strict `ctx.get('chaosUpload')`, so the action appears exactly when chaos-upload is mounted and the plugin stays an optional peer.

## Alternatives considered

**Extend the core attachment capability to documents.** Rejected: it touches `dsh-attachment` types and admission, `attachment-local` storage, `ui-conversation` serialization, `ui-attachment` rendering, the session-controller prompt path, and provider request projection at once, and "model-visible ⟺ logged" would require new session events for document content. The provider's content blocks accept images only, so document understanding needs host-side text extraction regardless — a separate, larger decision the core defers explicitly.

**Extend chaos-at-file instead of adding a package.** Rejected: chaos-at-file indexes existing workspace paths and its Remote answers searches; it deliberately reads no file bytes. Folding an inbound-bytes RPC into it couples two surfaces with different trust shapes, and its pre-step marker already scans every `@token`, which would double-mark uploaded references. The upload marker stays scoped to the configured directory and the overlap is documented in both READMEs.

**Insert the mention as a reference chip through `serializeReference`.** Rejected: a chip needs a registered trigger source with a codec for submit-time serialization; a plain-text `@path` token matches chaos-at-file's proven gesture, needs no new codec surface, and stays editable by the user.

**Widen the core intake with a non-image handler extension point.** Rejected for this change: paste and drop both terminate in `ui-conversation`/`ui-attachment` image intake, so a core seam would be the textbook home — but it modifies main-repo packages for a Chaos-profile capability, and the capture-phase interception already gets deterministic precedence without touching them. A later core seam remains the migration target if the interception's trade-offs bite.

**Append through `inputActions.setDraft`.** Rejected: `setDraft` replaces the whole editor document, destroying chips and undo history; the scoped insert-text event is the input machine's sanctioned mutation verb.

## Consequences

An upload rides the JSON RPC as base64, so one upload costs roughly 1.37× its byte length in request size and the cap defaults to 20 MiB — deployments wanting larger documents raise `maxFileBytes` deliberately. With chaos-at-file also enabled, both plugins mark the same `@<dir>/...` token once each; disable one marker surface when the duplication matters. The browser half resolves the service per render, so a late-loading plugin appears on the composer's next re-render rather than immediately. The marker proves existence at step preparation, not continued access by a later tool call.

The desktop intake owns its trade-offs: a mixed paste's accompanying text is dropped (file-manager pastes carry the path as text — losing it is the accepted cost), a document drop leaves the image rail's drag overlay copy stale until the synthetic dragend resets it, and interception depends on the composer-card marker (`data-composer-card`) the core InputBar owns — renaming that marker silently turns interception back into the core's image-only error.

What this buys: mobile users hand documents to the agent with zero core changes, the file lands in the workspace where the model's own tools operate, and the upload surface stays a removable chaos plugin rather than a core capability commitment.

## Testing

`packages/extensions/chaos-upload/tests` covers base64 admission, name sanitization, directory confinement, collision numbering, byte caps, the mention grammar and marker form, the end-of-draft span computation, and the client service flow against stubbed Remote and input faces. `packages/extensions/chaos-mobile/tests/attachment-button-interaction.client.spec.tsx` covers the chooser's three actions, the document routing, and the manual-reference notice.
