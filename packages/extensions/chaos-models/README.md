# `@deepseek-ai/dsh-plugin-chaos-models`

English | [中文](README.zh.md)

Composer-side configuration for non-official models served by `llm-pi-ai`.

## Behavior

The plugin adds **Model capabilities** to the existing model selector menu. It reads the active session model and writes a minimal patch to that model's `llm-pi-ai` profile. Its settings descriptor is warmed at client startup, shared by every open, and invalidated after settings commits, so reopening the dialog does not wait for another full settings read. The dialog configures:

- context-window capacity;
- default maximum output tokens;
- image-input support; and
- the available reasoning levels.

Saving a custom model edits its `models` entry. Saving a catalog model writes a `modelOverrides.<model-id>` entry. Both are validated and applied live by `llm-pi-ai`; its next model resolution rebuilds the adapter catalog. An empty reasoning selection writes `reasoningEfforts: false`; selecting `off` writes pi-ai's parameterless `off` value, and every other selected level uses its own wire value.

Official adapters and providers outside `llm-pi-ai` are not changed. They show a clear message instead of accepting an unsupported override.

## Composition

`chaos-bundle/cordis.patch.yml` mounts this package as `chaos-models`. The client half waits for `conversation.input.right` to mount its dialog, while the stock `conversation.input.model` menu provides the only visible entry point. Removing this plugin removes the menu entry and its dialog.

## Known Limitations and Deferred Work

- The dialog cannot discover a provider's capabilities. Enter only values supported by the endpoint.
- A selected model absent from the pi-ai settings route can receive an override, but the route must already be configured in `llm-pi-ai`.

No runtime invariant companion is published; the model cache is derived per query from the llm service and holds no cross-stream relation.
