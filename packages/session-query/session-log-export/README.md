---
description: "The Web Session-log export for users and maintainers downloading a session's durable log as a streamed ZIP: the /export command, the sidebar download action, the shared dialog, and the host route that archives descendants and attachments."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-export

English | [中文](README.zh.md)

## Summary

`dsh-session-log-export` downloads a Session's durable log as a ZIP archive in the browser. Type `/export` in the Web composer or pick **Download log** in the selected Session's sidebar: the browser half issues a `HEAD` preflight and hands the GET URL to the browser download manager, while the Host half streams the ZIP — the root session's verbatim artifact, every subagent descendant, and every referenced image — without buffering the archive in JavaScript. The command records only its human-command lifecycle and creates no model turn. One shared modal reports preparation, download start, or failure, and one Session admits one active download at a time.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package in a Web composition when a user must take a Session's durable log away as one archive. The common path is explicit: mount the package beside the Web bundle's command and conversation packages, then type `/export` or use the sidebar action.

### When to choose it

Choose it for browser-side export of the durable session log with descendants and attachments included. Avoid it when a Host-path writer is required — the browser's ordinary download behavior picks the destination, and no Host path or native folder action is returned.

### Minimal configuration

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

| Field | Default | Meaning |
|---|---|---|
| `compressionLevel` | `6` | DEFLATE level `0`–`9` for each ZIP entry |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-session-log-export) is the exhaustive source for every accepted field and its JSDoc.

### Command contract

| Input | Result |
|---|---|
| `/export` | Record a human-command lifecycle; the submitting browser receives the local execution acknowledgment and downloads `GET /api/session.export?sessionId=<id>&includeDescendants=true`. |
| `/export <path>` | Return an error. Browser downloads choose their destination through the browser's ordinary download behavior. |

The command is mounted only by the Web bundle. The local `command/executed` acknowledgment triggers the slash download only after a successful `/export` result in the browser that submitted it; other tabs still render the durable command row without repeating the browser side effect. The selected Session's sidebar menu action calls the same controller directly. Both entry paths issue a `HEAD` preflight, then hand the GET URL to the browser download manager without buffering the ZIP in JavaScript; they share in-flight collapsing, cancellation of the preflight on plugin disposal, preparation-error handling, browser save behavior, and the same Modal.

### Download behavior

The Host download endpoint flushes a live root Session before `readRaw`, so a slash-triggered ZIP includes the `command/run` and `command/done` pair whose acknowledgment started the download. Cold persisted Sessions require no flush. The modal reports preparation, download start, or failure. Closing it does not cancel an in-flight download and does not reopen it when that operation later settles. One Session admits one active download at a time; repeated gestures share that operation.

### Composition

The Host half (`inject: ['commands', 'connection']`) registers the `/export` command and the `/api/session.export` route; the browser half provides `ctx.sessionLogDownload` and keeps the Session-scoped modal in `conversation.session.header.utilities`. `dsh-client-ui-workspace` provides the selected Session's sidebar **Download log** menu action. The title-adjacent `conversation.session.header.actions` and Trajectory carry no export control.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the archive layout, the streaming bounds, and the route's error semantics; the observable contract is covered in [Use this package](#use-this-package).

### Archive contents

The ZIP's files are the sessions' stored artifact text verbatim plus every referenced media object: the root artifact sits under its original base name (`session.jsonl`), each subagent descendant under `subagents/<id>/<filename>`, and each image referenced by any included log under `media/<attachmentId>.<ext>` (content-addressed, so one archive never duplicates a shared image). No manifest is written — every file is byte-identical to the backend's durable artifact or attachment store and self-describing through its own header line or media type. A descendant that fails to read errors the stream rather than shipping a truncated archive.

### Streaming and memory bounds

Compression runs on the host with fflate's streaming Zip API, so the archive bytes are produced incrementally and the host never holds the whole archive in one buffer; production waits for consumer pull whenever the response queue reaches its fixed 64 KiB high-water mark plus one synchronous fflate push. Request abort and response-consumer cancellation share one producer signal and terminate the active compressor.

### Route error semantics

The route answers `400` for a missing or invalid `sessionId` query parameter, `500` when the `sessionQuery`, `sessionPersistence`, or `attachments` service is absent, `501` when the persistence backend does not expose per-session raw artifacts (`supportsRawArtifacts`), `404` for a session without a stored artifact, and `500` when preparing the stored artifact fails.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host entry: `/export` command registration and the `/api/session.export` route |
| [`src/archive.ts`](src/archive.ts) | Archive assembly: flush barrier, entry order, media collection, streaming ZIP with capacity gate |
| [`src/client/index.ts`](src/client/index.ts) | Browser entry: download controller provision, `command/executed` listener, modal slot |
| [`src/client/controller.ts`](src/client/controller.ts) | One in-flight browser download per Session; HEAD preflight and modal state |
| [`src/client/Dialog.tsx`](src/client/Dialog.tsx) | The shared Session-scoped result modal |
| [`src/client/HeaderAction.tsx`](src/client/HeaderAction.tsx) | Header-utilities slot contribution rendering the modal |
| [`src/client/locales.ts`](src/client/locales.ts) | Browser dictionaries for the dialog |

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Human `/export` control

#### What the model sees

Nothing model-facing. `/export` stays on the human-command plane: the commands service records its `command/run`/`command/done` lifecycle pair as log-only session events with no model turn, and the ZIP the route streams goes to the browser without entering the session log, model history, or any request.

#### Token effect

Zero. The command creates no model turn; the log-only lifecycle pair and the browser download contribute no request tokens.

#### KV Cache effect

None. The log-only command lifecycle and the browser download do not change the derived request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Requires a per-Session raw artifact** — the download endpoint reads the shipped JSONL provider's plaintext or zstd artifact; an out-of-tree provider without a raw artifact cannot serve this route.
- **Browser download, not a Host-path writer** — the browser chooses the local destination; no Host path or native folder action is returned.
- **Preflight reports only pre-stream failures** — a descendant or attachment failure after the browser accepts the GET is reported by the browser download manager, not by the dialog.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked pages.

#### Future: export destinations beyond the browser

The download is deliberately browser-scoped; a Host-path or native folder export would need a new endpoint contract and a decision on where the ZIP lands.

</details>

**Runtime invariant:** No companion is published. Connection and the command registry own both registrations, while each export reads authoritative Session services.
