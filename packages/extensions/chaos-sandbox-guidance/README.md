---
description: "Model guidance against redundant sandbox escalation in the DeepSeek Harness: a per-request runtime-context section that tells danger-full-access sessions to call tools directly and keeps the strictly-wider one-retry rule for confined sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-sandbox-guidance

English | [中文](README.zh.md)

## Summary

Keep a model from passing redundant sandbox escalation arguments. In a `danger-full-access` session the guidance tells the model to call Bash and filesystem tools directly without `sandbox_permissions` or `justification`, and to read the "not strictly wider than this call's current" error as a signal to remove those arguments, not retry them. In confined modes the guidance keeps the rule that escalation is only one retry after a real sandbox denial and must request a strictly wider mode. The text is regenerated from the session's resolved policy for every prompt assembly and changes no enforcement: the sandbox executor remains the enforcement owner.

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

Mount the plugin in a composition that resolves a sandbox policy; the Chaos bundle inserts this row by default.

### When to choose it

Choose this plugin when resumed or long sessions accumulate tool-failure transcripts that tempt the model into redundant escalation calls. It requires the `sandboxPolicy` and `systemPrompt` services and registers nothing else.

### Composition

The Chaos bundle mounts this package as `chaos-sandbox-guidance`:

```yaml
- id: chaos-sandbox-guidance
  name: '@deepseek-ai/dsh-plugin-chaos-sandbox-guidance'
```

The plugin has no configuration; remove the row to stop the guidance.

### Behavior

For every prompt assembly the plugin resolves the addressed session's effective sandbox mode through the sandbox-policy service and contributes one `chaos:sandbox-escalation` context section whose text depends on that mode; an assembly without an agent session contributes no text. The section is regenerated for each request — including resumed sessions — and neither weakens enforcement nor rewrites tool arguments.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers one dynamic context through `ctx.systemPrompt.context` under the name `chaos:sandbox-escalation`. The text provider reads the assembly's agent session, resolves its sandbox mode through the sandbox-policy service, and returns one of two fixed guidance strings; an assembly without an agent session returns empty text, which contributes nothing. The registration is scoped to the plugin's context and withdraws with its fiber.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: inject declaration, the two guidance texts, context registration |
| — | No runtime invariant companion is published; the guidance text derives from the policy service's resolved mode at each read, and the context registration rides the plugin's own scope. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Sandbox policy](../../sandbox/sandbox-policy/README.md) — the service that resolves the session's effective mode.
- [System prompt](../../core/system-prompt/README.md) — the context registry this plugin registers into.
- [Chaos bundle](../chaos-bundle/README.md) — the composition that mounts this plugin.

-----

<a id="model-experience"></a>
## Model Experience

### Sandbox escalation runtime context

#### What the model sees

One `chaos:sandbox-escalation` section inside the joined `Current runtime context` snapshot — a user-role message the agent loop appends when the rendered snapshot differs from the retained one. The section's text is one of two fixed strings, chosen by the session's resolved sandbox mode; an assembly without an agent session contributes no text. No tool schema is added and tool execution is unchanged.

##### danger-full-access guidance

```markdown
IMPORTANT: the current session is already running with danger-full-access. For Bash, Read, Edit, Write, and filesystem calls, call the tool directly with only its normal arguments. Do not include sandbox_permissions or justification. Never try to change to workspace-write or danger-full-access through a permission command. The error "not strictly wider than this call's current" means the redundant escalation arguments must be removed; it is not a reason to retry escalation.
```

##### confined-mode guidance

```markdown
Use sandbox_permissions only for one retry after a real sandbox denial, and only when the requested mode is strictly wider than the current mode. Do not retry an operation merely because another tool call failed.
```

#### Token effect

One guidance paragraph inside each appended runtime-context snapshot; while the snapshot text is unchanged no new message is appended, so a stable mode adds nothing beyond the retained snapshot.

#### KV Cache effect

The snapshot appends as a user-role message after the reusable prefix, so provider cache reuse is preserved; a mode change appends a new snapshot rather than rewriting the prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits are current package constraints, not a task backlog.

- **The plugin guides compliant models only** — it cannot repair an already emitted tool call; the sandbox executor remains the enforcement owner.
- **Every confined mode receives the same guidance text** — the section distinguishes only `danger-full-access` from everything else, so mode-specific advice such as read-only versus `workspace-write` does not exist.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
