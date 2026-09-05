# `@deepseek-ai/dsh-plugin-chaos-sandbox-guidance`

[English](README.md) | 中文

为 sandbox 提权参数提供动态的模型指引。

## 行为

插件在每次 agent request 时读取会话的有效 sandbox policy。在 `danger-full-access` 下，它要求模型直接调用 Bash 和文件系统工具，不传 `sandbox_permissions` 或 `justification`；同时明确说明 "not strictly wider than this call's current" 错误表示应删除这些参数，而不是再次提权。在受限模式下，它保留原有规则：仅在真实 sandbox 拒绝后单次重试，且请求的模式必须严格宽于当前模式。

该指引会根据当前会话 policy 在每个请求中重新生成，包含恢复的会话。它不放宽执行限制，也不改写工具参数。

## 组合

Chaos bundle 将该包以 `chaos-sandbox-guidance` 挂载。它需要 `sandboxPolicy` 和 `systemPrompt`。

## 模型体验

### 沙箱策略提醒

#### 模型所见

每个请求一个 `chaos:sandbox-escalation` 系统提示词段落：一条简短提醒，其文本取决于会话解析出的沙箱模式（`danger-full-access` 指引与受限模式指引不同）。不添加 tool schema，工具执行不变。

#### Token 影响

沙箱模式生效期间，每个请求一条简短提醒句。

#### KV Cache 影响

当会话 sandbox mode 改变时，动态 policy 提示也会变化，可能降低该请求的缓存复用。

## 已知限制与暂缓事项

- 插件只能引导遵循指引的模型，不能修复已经发出的 tool call。sandbox executor 仍是执行限制的拥有方。

**运行时不变式：** 不发布 companion。指引文本在每次读取时从策略服务解析出的模式派生，提示词段落与提醒投影都通过 ctx.effect 事务式注册。
