# Agent Note: Chaos sandbox escalation guidance

Status: implemented

[English](2026-08-31-chaos-sandbox-escalation-guidance.md) | 中文

## Problem

恢复后的 agent 可能会阅读先前的 sandbox escalation 失败记录，却不按当前会话 policy 行动。当会话已经拥有 `danger-full-access` 时，它可能仍携带 `sandbox_permissions: "danger-full-access"` 重复调用 Bash、write 或 edit。严格加宽执行规则会正确拒绝这种非提权请求，但返回的错误可能引发更多无效重试。

## Decision

`@deepseek-ai/dsh-plugin-chaos-sandbox-guidance` 从 `sandboxPolicy.resolve({ session })` 为每个请求提供模型指引。`danger-full-access` 会话会被要求省略 `sandbox_permissions` 与 `justification`，直接调用工具；受限会话则继续遵守一次重试、基于真实拒绝、且目标模式严格更宽的 escalation 规则。

Web 组合和 Chaos bundle 都以 `chaos-sandbox-guidance` 挂载此插件。它不改写工具参数、不放宽执行限制，也不会把非严格加宽的 escalation 变成成功调用。核心 sandbox policy 仍然是有效模式的来源；该插件只补足恢复后模型上下文所需的行动规则。

## Alternatives considered

**让 executor 静默接受相等或更窄的请求。** 不采用，因为严格加宽规则区分一次已批准的 escalation 与会话的常驻 policy。接受冗余参数会掩盖错误的模型行为，并削弱可执行的 escalation 协议。

**修改核心 sandbox-policy context。** 不采用，因为该 context 有意只说明与能力无关的 policy 事实。重试机制与纠正指引属于 Chaos 专用的模型引导，而不是 sandbox policy 的共享约定。

**只在无效工具结果之后注入纠正信息。** 不采用，因为恢复后的 agent 在第一次工具调用之前就需要当前模式规则。每次请求的 system-prompt 指引可覆盖新请求与恢复请求，且不会新增另一条持久失败记录。

## Consequences

有效模式为 `danger-full-access` 的恢复后 Chaos 会话会获得明确的直接调用指引，从而减少冗余的 escalation 尝试，同时不改变受限会话的已批准 escalation 路径。动态 prompt section 会随会话模式改变，可能降低模式切换请求的 KV-cache 复用。模型仍可能忽略指引，因此 executor 侧的严格加宽执行规则仍然必要。
