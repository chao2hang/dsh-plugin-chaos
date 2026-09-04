# Agent Note: Chaos fork 基线取代推送

Status: implemented

[English](2026-09-04-chaos-fork-baseline-supersession.md) | 中文

## Problem

Chaos fork 的 `master` 分叉了两次：远端仍带着旧基线的插件历史（十个提交，止于 `fix(chaos-mobile): close initially open details panel`），本地则是尚未推送的 dsh 0.1.2-alpha.3 迁移提交。迁移是从缺少远端最后修复的树上切出的，直接推送会静默丢内容：整个 `chaos-sandbox-guidance` 包及其 bundle 接线、移动端详情面板历史条目认领、命令斜杠按钮隐藏。

## Decision

推送先调和内容、后取代历史。`chaos-sandbox-guidance` 从 `chaos/master` 找回并完成迁移：插件的 context 直接在 `apply` 里注册（其 `inject` 导出已经把 `sandboxPolicy` 与 `systemPrompt` 声明为前置），测试先挂载 `SessionProjectionRegistry`（策略服务注入 `sessionProjections`，缺它则服务永不发布）。详情面板认领与斜杠按钮 CSS 块连同测试一并找回。根 tsconfig glue、bundle 的 patch 行、依赖与 README 行重新加回。远端十个提交里的其余内容要么已被迁移吸收（chaos-auth 的已认证远程 API、`uiWorkspace` 改名），要么有意移除（chaos-desktop-panel）。

推送本身是带租约的取代：迁移基线替换 `chaos/master` 上的旧基线历史，因此使用对取回远端头的 `--force-with-lease`。

## Alternatives considered

**把 `chaos/master` 合并进迁移基线。** 否决：会把 fork 的压缩迁移历史与被取代的基线纠缠，并用合并机制解决同样的冲突；找回内容是一个小而可枚举的集合。

**摘取远端十个提交。** 否决：它们针对旧基线编写且大多已被吸收；真正缺失的内容只有三处。

## Consequences

推送后远端旧基线提交从 `chaos/master` 不可达（在被回收前仍可按哈希取回）。找回的 `chaos-sandbox-guidance` 将在下一次 Web profile 重启时经 chaos bundle 行激活。调和依赖人工对比两个分支尖端；未来从过期树上切出的迁移需要同样的审计——取代前先与远端对比 chaos 插件目录。

## Testing

找回的包以迁移后的注册形态通过其 guidance 与 invariant 测试（5 个）；整套 chaos 测试一并通过：chaos-sandbox-guidance、chaos-mobile、chaos-upload、chaos-janitor 共 143 个测试，host 与 client 类型检查聚合干净。
