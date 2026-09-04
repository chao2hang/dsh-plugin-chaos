# `@deepseek-ai/dsh-plugin-chaos-sandbox-guidance`

English | [中文](README.zh.md)

Adds dynamic model guidance for sandbox escalation arguments.

## Behavior

For every agent request, the plugin reads the session's effective sandbox policy. In `danger-full-access`, it tells the model to call Bash and filesystem tools directly, without `sandbox_permissions` or `justification`; it also explicitly identifies the "not strictly wider than this call's current" error as a signal to remove those arguments, not retry them. In confined modes, it retains the rule that escalation is only a one-shot retry after an actual sandbox denial and must request a strictly wider mode.

The guidance is model-visible and is regenerated from the current session policy for every request, including resumed sessions. It does not weaken enforcement or rewrite tool arguments.

## Composition

The Chaos bundle mounts this package as `chaos-sandbox-guidance`. It requires `sandboxPolicy` and `systemPrompt`.

## Model Experience

The plugin adds a short policy reminder to each model request. It adds no tool schema and does not change tool execution.

#### KV Cache effect

The dynamic policy reminder can change when the session's sandbox mode changes, which can reduce cache reuse for that request.

## Known Limitations and Deferred Work

- The plugin guides compliant models but cannot repair an already emitted tool call. The sandbox executor remains the enforcement owner.
