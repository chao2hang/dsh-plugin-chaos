---
description: "Browser dialog for setting context-window, output-token, image-input, and reasoning-level capabilities on non-official llm-pi-ai models, for users choosing or debugging per-model overrides."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-models

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos-models` adds a Model capabilities dialog behind the model selector's menu: it reads the session's active model and writes a minimal capability patch to that model's `llm-pi-ai` settings entry. You can set the context window, the default maximum output tokens, image-input support, and the selectable reasoning levels; `llm-pi-ai` validates the write and applies it at its next model resolution, with no restart. Only the fields you changed are written. Official adapters and providers outside `llm-pi-ai` are refused with a notice instead of an unsupported override. The dialog is browser-only; the host entry carries the reasoning-level vocabulary and no runtime behavior.

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

Open the model selector menu in the composer and choose its capabilities row; the dialog loads the active session's model and its pi-ai settings entry.

### When to choose it

Choose this dialog when a non-official model is served through `llm-pi-ai` and its entry misstates a capability — a wrong context window, a missing reasoning level, or image input the endpoint accepts. It writes only `llm-pi-ai` settings; a model whose provider is not configured there answers `当前模型不是可配置的非官方模型。` and accepts nothing. Official DeepSeek adapters own their capability declarations and are not editable through this dialog.

### What the dialog configures

- **Context window** — a slider with unit precision plus common stops from 16K to 2M; the field accepts suffixes like `128K` or `1M`.
- **Maximum output tokens** — a slider with unit precision plus common stops from 1K to 128K.
- **Image input** — a checkbox that writes `input: ['text', 'image']` when on and `input: ['text']` when off.
- **Reasoning levels** — the ordered pi-ai levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`); an empty selection — or `off` alone — writes `reasoningEfforts: false`, `off` selected alongside other levels writes pi-ai's parameterless `off` value, and every other selected level keeps its existing wire value.

### How saves are applied

Saving a model declared in the route's `models` list edits that entry (the write replaces the complete array with one edited row); saving an installed-catalog model writes a `modelOverrides.<model-id>` entry. The write is one settings path mutation against the `llm-pi-ai` namespace carrying the snapshot's revision; only fields that changed leave the dialog. `llm-pi-ai` validates the section and applies it at its next model resolution — the adapter catalog rebuilds without a restart. The dialog's settings snapshot is warmed once per client and invalidated after every settings commit, so reopening it does not wait for another full settings read.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is two halves around one settings seam: an empty host entry that exports the reasoning-level vocabulary, and a browser half that renders the dialog and writes through the settings remote.

### Client wiring

The browser half registers one keyed `conversation.input.right` slot (`chaos-model-capabilities`) and renders nothing by itself: the model selector's capabilities row dispatches the `dsh:open-model-capabilities` window event, and the dialog opens for the visible session. A bounded in-process cache holds one settings describe snapshot — warmed at client startup, shared by every open, and invalidated by the `settings/document-updated` remote event and by the dialog's own saves. The dialog reads the model catalog through the session remote; the write path is `saveModelCapabilities`, one `set` operation whose path depends on whether the model is a route `models` entry or an override, because settings path mutation walks plain objects and cannot index through the `models` array in place.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host entry: reasoning-level vocabulary and the `reasoningEffortsOf` conversion |
| [`src/client/index.ts`](src/client/index.ts) | Browser entry: slot registration, settings cache, remote adapter |
| [`src/client/ModelCapabilities.tsx`](src/client/ModelCapabilities.tsx) | Dialog component, capacity parsing and snapping, the settings write |
| [`tests/models.client.spec.ts`](tests/models.client.spec.ts) | Level conversion, capacity parsing, and the three save-operation shapes |
| — | No runtime invariant companion is published; the browser half owns one keyed slot registration whose dialog state derives from the cached settings snapshot and the model catalog on each open. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [pi-ai LLM adapter](../../llm/llm-pi-ai/README.md) — the settings route that owns validation and the models / modelOverrides shape.
- [Model selection menu](../../client/ui-model-selection/README.md) — the menu whose capabilities row opens the dialog.
- [Chaos bundle](../chaos-bundle/README.md) — the layer that declares this plugin as a dependency.
- [web-app bundle](../../bundle/web-app/README.md) — the layer that mounts this row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the capability dialog renders in the browser and its selections persist through the pi-ai settings route; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the dialog cannot decide for you. They are current package constraints, not a task backlog.

- **The dialog cannot discover a provider's capabilities** — enter only values the endpoint supports; a wrong context window or output cap is applied as written.
- **A selected model absent from the pi-ai settings route cannot be configured** — the route must already name the provider in `llm-pi-ai` before the dialog opens for its models.
- **The dialog's copy is hardcoded Simplified Chinese** — it does not route through the locale dictionaries the sibling Chaos plugins register.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
