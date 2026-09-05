---
description: "Input trigger pipeline for the dsh web composer: '/' and '@' detection under the caret, the grouped candidate menu with drill breadcrumbs, keyboard arbitration, and pick routing to sources registered through ctx.inputTriggers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-input-trigger

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-input-trigger` gives the web composer its `/` and `@` trigger pipeline: as the user types, it detects the live trigger token under the caret, opens a grouped candidate menu above the composer, and routes every pick — pointer, Tab, Enter, or Space — to the source that registered it. A feature plugin registers one source through `ctx.inputTriggers` and gets candidate fetching, menu state, keyboard arbitration, and programmatic launching without owning any of that machinery; the conversation wiring layer drives the per-session controller through `track`/`arbitrate`/`onSpace`/`adjudicate`. Picks settle as `CommandClaim` or `ReferenceInsert` data whose model-visible consequences are owned by the consuming host and input-machine packages, not this plugin. Choose it when adding slash-command or `@`-reference sources to a composer built on ui-conversation.

## Table of Contents

- [Use this package](#use-this-package)
- [The candidate menu](#the-candidate-menu)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Register one source through `ctx.inputTriggers.registerSource(src)`; the conversation wiring layer resolves a per-session controller with `sessionOf` and drives it. The controller also exposes `toggleSource` for hosts that provide a programmatic launcher; the mobile composer uses typed `/` commands rather than a toolbar launcher.

### Register a source

One `InputTriggerSource` binds to `'/'` or `'@'`, names one menu group (duplicate trigger/name pairs throw), and declares its display `order` and `showGroupTitle`. The pipeline calls `candidates(session, req)` per hit with the live query, the `AbortSignal` superseded on the next query or menu close, and a `ClientSessionContext` projection — sessions are always agent-backed, so the projection is the session identity alone. Every pick lands in `onPick`; a source warmed in every session controller it can reach implements `warm`, and one whose `lexicon` roll changes after warm implements `subscribeLexicon(session, listener)` so the controller re-polls and republishes the aggregation. A source producing insert outcomes carries a `ReferenceCodec`: the clipboard projection serves copy/cut/persistence, while `serializeReference` routes the model serialization per occurrence at submit time and a missing owner or codec rejects instead of silently downgrading to the clipboard text.

### Detection and guard tiers

`detectTrigger` scans backward from the caret and applies word-boundary rules: a trigger char opens at start of draft, after whitespace (newlines included), or after punctuation, never after a word character. Two URL carve-outs keep `/` dead inside URLs — `/` after a scheme-separating `:` and the second slash of `//`. `@` first uses the shared file-reference grammar, including an open quoted token that may span whitespace. Guard tiers derive from the input phase: `plain` keeps both chars live, `claimed` suppresses `/` while `@` stays live, `frozen` suppresses both.

### Space and enter adjudication

The pipeline is command-agnostic: space and enter adjudication poll the optional `matchSpace`/`matchEnter` hooks in registration order and the first non-undefined answer wins. Space fires mid-keystroke and must answer synchronously from hot state over the just-completed leading token; enter may strong-wait the source's own warmup and parses the full trimmed draft itself. Enter adjudication also carries a `SubmitEnvelope` — the composer's image-attachment count — so a source can refuse a submission it cannot consume whole; a `CommandClaim` declares `images: true` when its command accepts composer images, and its `submit` then receives the serialized payloads as a third argument.

-----

<a id="the-candidate-menu"></a>
## The candidate menu

MenuView renders the menu store into the `conversation.input.overlay` slot (list kind, session scope) and renders null while closed. Typed triggers seed every source registered for that trigger; a programmatic launcher seeds only its requested source and publishes the source name through the controller's `launcher` snapshot store until the menu closes or typed tracking resumes. Groups sort by the optional `InputTriggerSource.order` (lower first, default 0, ties keep registration order) under title rows localized through the `slash.menu` locale namespace; an unknown source shows its raw name. `showGroupTitle: false` suppresses that row through pending and ready states, while a ready group whose candidates declare `sections` uses those section rows in place of the source title.

A drill refines the query in place instead of resolving the candidate: Tab or the row's chevron descends, breadcrumbs (`header` + crumb picks) navigate back, and the `drilled` flag survives further typing until the menu closes. While a reply to a new query is pending, the previous items and highlight stay rendered (stale-while-revalidate) with skeletons only for a pending group that has no items; settlements are generation-gated so an older response never overwrites a newer one, each new query aborts the preceding fetch, and a failed source drops its group silently with a console record. The list height clamps to the space above the composer, and a pointer down outside both the menu and the surrounding composer card dismisses it. Combobox pattern: focus stays in the textarea, rows pick on mousedown, the highlight rides `aria-activedescendant`, and IME composition passes every key through.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the layering and the pick paths; the observable contract is covered above.

### Layering

`src/core/` is the pure core — `detectTrigger`, `menuReduce`/`seedGroups`/`MENU_CLOSED`, `exactMatch` — with zero React, DOM, or cordis. `src/client/service.ts` is the root half: the stateless source registry plus the per-session controller map, where registration order is menu group order and match-hook poll order. `src/client/controller.ts` owns every piece of mutable interaction state — the authoritative hit (span included; it outlives menu close for space adjudication), the menu, `launcher`, `headers`, and `lexicon` snapshot stores, and the candidate-fetch lifecycle — and executes pick outcomes by dispatching the scoped input-mutation events (`slash/input-begin-command`, `slash/input-insert-text`, `slash/input-insert-reference`). `src/types.ts` and the two `contract.ts` files are the frozen cross-package contract; changes require main-thread arbitration.

### Source map

| File | Role |
|---|---|
| [`src/core/detect.ts`](src/core/detect.ts) | Caret trigger detection and word-boundary rules |
| [`src/core/menu.ts`](src/core/menu.ts) | Pure menu reducer, group seeding, exact-match lookup |
| [`src/client/service.ts`](src/client/service.ts) | Root source registry and per-session controller resolution |
| [`src/client/controller.ts`](src/client/controller.ts) | Per-session hit, menu, headers, lexicon, fetch, and pick execution |
| [`src/client/MenuView.tsx`](src/client/MenuView.tsx) | The overlay menu component registered into `conversation.input.overlay` |
| [`src/client/locales.ts`](src/client/locales.ts) | `slash.menu` dictionaries |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Input machine and slash pipeline](../../../.agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md) — the composer wiring that drives this controller.
- [ui-conversation](../ui-conversation/README.md) — the composer that owns the input overlay slot and the input state machine.
- [file-reference](../../context/file-reference/README.md) — the shared `@file` grammar detection consumes.
- [ui-primitives](../ui-primitives/README.md) — `useAnchoredMaxHeight` and the reference icons the menu renders with.

-----

<a id="model-experience"></a>
## Model Experience

None, as the trigger pipeline is browser presentation only — picks produce `CommandClaim`/`ReferenceInsert` data whose model-visible consequences (host command execution; inserted reference text riding an ordinary prompt) are owned by the consuming host and input-machine packages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what a source author cannot register or surface today; they are current package constraints, not a task backlog.

- **Only a global source roster exists** — sources register on the root service and reach every live session controller; there is no per-session registration or shadowing, so a session-scoped source need cannot be met.
- **A failing source drops silently from the open menu** — candidate, header, and lexicon failures log to the console and remove the group (or skip the roll) with no error row; a source must surface its own failures through its candidates or its owning feature.
- **Menu copy keys are open-ended** — group titles are looked up by source name in the `slash.menu` dictionary and an unregistered key renders verbatim, so a source shipping under a new name needs a dictionary entry to localize its title.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The trigger pipeline is a browser-side pure core (detect/reduce/match) plus a registry whose disposal is proven by the HMR-safety spec; it emits no cordis events and owns no cross-plugin mutable state.
