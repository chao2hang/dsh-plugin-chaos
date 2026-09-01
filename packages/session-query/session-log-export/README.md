# @deepseek-ai/dsh-session-log-export

English | [中文](README.zh.md)

Web Session-log download control over the host-streamed ZIP endpoint owned by this package's own Host half. The Host half registers the route; the browser half owns one download controller and a result modal shared by the current Session's sidebar **Download log** action and the slash command. ZIP generation, raw JSONL/zstd reads, descendants, attachments, backpressure, and HTTP error semantics remain owned by the [Host streaming route](src/index.ts).

## Command contract

| Input | Result |
|---|---|
| `/export` | Record a human-command lifecycle; the submitting browser receives the local execution acknowledgment and downloads `GET /api/session.export?sessionId=<id>&includeDescendants=true`. |
| `/export <path>` | Return an error. Browser downloads choose their destination through the browser's ordinary download behavior. |

The command is mounted only by the Web bundle. The local `command/executed` acknowledgment triggers the slash download only after a successful `/export` result in the browser that submitted it; other tabs still render the durable command row without repeating the browser side effect. The selected Session's sidebar menu action calls the same controller directly. Both entry paths issue a `HEAD` preflight, then hand the GET URL to the browser download manager without buffering the ZIP in JavaScript; they share in-flight collapsing, cancellation of the preflight on plugin disposal, preparation-error handling, browser save behavior, and the same Modal.

The Host download endpoint flushes a live root Session before `readRaw`, so a slash-triggered ZIP includes the `command/run` and `command/done` pair whose acknowledgment started the download. Cold persisted Sessions require no flush.

The modal reports preparation, download start, or failure. Closing it does not cancel an in-flight download and does not reopen it when that operation later settles. One Session admits one active download at a time; repeated gestures share that operation.

## Composition

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

The Web bundle mounts the package beside `dsh-host-webserver`, `dsh-commands`, `dsh-client-ui-commands`, and `dsh-client-ui-conversation`. The package keeps its Session-scoped modal in `conversation.session.header.utilities`; `dsh-client-ui-workspace` provides the selected Session's sidebar **Download log** menu action. The title-adjacent `conversation.session.header.actions` and Trajectory carry no export control.

## Model Experience

### Human `/export` control

#### What the model sees

Nothing. `/export` stays on the human-command plane, and the ZIP download does not enter model history.

#### Token effect

Zero. The command creates no model turn.

#### KV Cache effect

None. The log-only command lifecycle and browser download do not change the derived request prefix.

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
