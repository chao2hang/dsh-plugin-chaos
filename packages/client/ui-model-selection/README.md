---
description: "Model selection for the dsh web composer: the /model command popup and the composer's Model/Effort seat over one shared per-session directory (ctx.modelDirectories), routed through session.selectModel with generation-guarded loads, routability-based composer blocking, and refresh on adapter, settings, and credential events."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-model-selection

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-model-selection` lets the user pick the provider, model, and reasoning effort a session runs with, from two entries that share one state: the `/model` command popup and the composer's Model/Effort seat. Both load the session's advisory catalog through the Host and submit a complete selection through `session.selectModel`, so a switch made in either entry is what the other shows next. The composer trigger opens a two-level menu whose Model pane filters provider groups by model name, model id, provider name, provider id, or description; the selected exact model supplies its adapter-owned effort names, descriptions, and default. Selection is advisory-only until the Host applies it to the next request, and when no adapter serves the session's route the plugin raises a composer block with its own copy — recover clears it without a reload. Choose it when composing a session whose model route the user controls.

## Table of Contents

- [Use this package](#use-this-package)
- [Composer blocking](#composer-blocking)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Both entries resolve their session's directory through `ctx.modelDirectories.directoryFor(sessionId)`; nothing registers a model surface directly. The `/model` popupSelect contribution registers through `ctx.commandUi`, while the composer's named `conversation.input.model` seat is declared by ui-conversation and filled here.

### The shared per-session directory

The Host-reported provider/model/reasoning `ModelSelection` is the single selection fact, but it is echoed only when the exact provider/model pair remains in the advertised groups; an absent catalog row leaves the routable selection intact while the trigger prompts `Select model`, no stale row is synthesized, and no Effort row is shown until the user picks an advertised model. Directory loads and selections share a generation counter so an older response never overwrites a newer one; a connection reset drops every resident projection and repulls the Host-restored selection before display. Provider-local metadata failures list inline while usable groups stay selectable, and selection failures retain the prior selection and directory. Failures ride each entry's own retry surface: the in-menu error strip with Retry serves catalog loads, while a rejected selection announces through the transient toast anchored to the composer card.

### Effort selection and capabilities

`/model` applies the selected model's default effort, and the composer can then choose any advertised effort. When a composed capability dialog is present (probed on menu open through its `data-model-capabilities` marker), the root menu gains a capabilities row that dispatches the `dsh:open-model-capabilities` event with the session id; the plugin owns the trigger, not the dialog.

### Refresh on Host-side changes

Every resident directory refetches directly on the forwarded `llm/adapters-updated`, `settings/document-updated`, and `credentials/reference-updated` owner events. Provider topology, provider catalogs, and the default selection therefore converge without the Host or client runtime deriving a separate model-change alias.

-----

<a id="composer-blocking"></a>
## Composer blocking

When the Host reports that no adapter serves the session's route (`session.models.routable`), this plugin raises a composer block through `ctx.conversation.blocks` and the input goes inert with this plugin's own copy; recovering clears it without a reload. It follows `routable` and nothing else: a `null` — before the first load, or after one failed — never blocks, or a slow Host would lock a working composer, and catalog membership never blocks either, because a route serving a model it stopped advertising is missing from the groups yet perfectly usable. The trigger's own `Select model` fallback still covers that case, which is display, not a gate.

Directories are per-session, resolved lazily through `ctx.modelDirectories.directoryFor(sessionId)`, and disposed with the session scope. Addressed subagent sessions expose neither entry, and their directory rejects loads, selections, and reconnect refreshes, because ordinary Agent-bound model RPCs would activate persisted child history outside the direct-parent continuation path.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the state split and the wiring; the observable selection contract is covered above.

### State split

`ModelDirectoryResolver` (`service.ts`) owns the lazy per-session map and one Host-generation `ModelCatalogDirectory` (`catalog.ts`) shared by every session — at most one in-flight catalog load per generation, invalidated and reloaded on refresh, cleared and reloaded on connection reset. Each `ModelDirectory` (`directory.ts`) combines that shared catalog with the session's durable model-selection projection (`binding.session.projections.faceOf('modelSelection')`), subscribing to both and re-deriving its store snapshot on either change; `select()` guards on a per-directory generation so a stale response cannot win, and `resetConnected()` invalidates in-flight selections from the previous Host generation. The composer block is pushed, not polled: the resolver cannot be read by the composer (the dependency runs one way), so the block publishes on the store snapshot and retracts with the session scope. Per-session storage follows the client service pattern (a lazy service-internal map whose entry is deleted by the owning scope's disposer) rather than the host ScopedLayers registry, which derives scope from the host carrier mechanism and models global+shadow named registries — this is a per-session singleton with no global layer to merge.

### Source map

| File | Role |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | `ctx.modelDirectories` resolver and composer-block publication |
| [`src/client/directory.ts`](src/client/directory.ts) | Per-session shared directory store and select/load verbs |
| [`src/client/catalog.ts`](src/client/catalog.ts) | One Host-generation shared catalog with generation-guarded loads |
| [`src/client/ModelSelect.tsx`](src/client/ModelSelect.tsx) | The composer seat: two-level menu, filter, effort rows, toast |
| [`src/client/index.ts`](src/client/index.ts) | The two registrations (`/model` popup and composer seat) |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the selection contract is not enough.

- [session-controller](../../api/session-controller/README.md) — the Host RPC this package calls: `selectModel` and `modelCatalog`.
- [ui-commands](../ui-commands/README.md) — the `/model` popupSelect surface.
- [ui-conversation](../ui-conversation/README.md) — the composer seat this plugin fills.
- [Web session model selector](../../../.agents/notes/implemented/feature/2026-07-24-web-session-model-selector.md) — the two-entry design.
- [Model selector filter](../../../.agents/notes/implemented/feature/2026-08-23-model-selector-filter.md) — the Model pane's filter decision.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `session.selectModel`: both entries submit a complete `ModelSelection` that the Host logs as a durable `model/selection` session event and snapshots at the next prompt-assembly boundary, so the following request uses the selected provider, model, and effort while a running step keeps its already-assembled request; menu interaction adds no prompt content.

#### KV Cache effect

Switching the route can reduce or invalidate provider-side cache reuse for subsequent requests; the prompt prefix itself is untouched.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the entries cannot select or accept; they are current package constraints.

- **No create-time or addressed-subagent selection** — both entries require an existing ordinary session's Agent; there is no draft-phase model choice to fold into session creation, and subagent continuation deliberately exposes no independent model-selection contract.
- **Directory names are presentation-only** — selection and persistence use provider/model/effort ids; a provider whose catalog or exact-model metadata lookup fails lists as an unselectable failure row until reload.
- **No arbitrary effort input** — the composer offers only the exact model's adapter-advertised levels; an adapter without reasoning metadata leaves the Effort row absent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. A single command contribution registration whose disposal is proven by the HMR-safety spec — it emits no cordis events and owns no cross-plugin mutable state.
