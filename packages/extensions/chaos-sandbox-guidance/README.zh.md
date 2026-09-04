# `@deepseek-ai/dsh-plugin-chaos-sandbox-guidance`

[English](README.md) | 中文

为 sandbox 提权参数提供动态的模型指引。

## 行为

插件在每次 agent request 时读取会话的有效 sandbox policy。在 `danger-full-access` 下，它要求模型直接调用 Bash 和文件系统工具，不传 `sandbox_permissions` 或 `justification`；同时明确说明 "not strictly wider than this call's current" 错误表示应删除这些参数，而不是再次提权。在受限模式下，它保留原有规则：仅在真实 sandbox 拒绝后单次重试，且请求的模式必须严格宽于当前模式。

该指引会根据当前会话 policy 在每个请求中重新生成，包含恢复的会话。它不放宽执行限制，也不改写工具参数。

## 组合

Chaos bundle 将该包以 `chaos-sandbox-guidance` 挂载。它需要 `sandboxPolicy` 和 `systemPrompt`。

## 模型体验

插件会向每个模型请求添加简短的 policy 提示。它不添加 tool schema，也不改变工具执行。

#### KV Cache 影响

当会话 sandbox mode 改变时，动态 policy 提示也会变化，可能降低该请求的缓存复用。

## 已知限制与暂缓事项

- 插件只能引导遵循指引的模型，不能修复已经发出的 tool call。sandbox executor 仍是执行限制的拥有方。
