# Agent Note: Chaos 无用功能移除（at-file、sandbox-guidance）

Status: implemented

[English](2026-09-04-chaos-unused-removal.md) | 中文

## Problem

两个 chaos 包随 fork 存在却从未服务过部署：`chaos-at-file` 从未组合进 Web profile（内置 `ui-reference` 源拥有 `@` 手势），`chaos-sandbox-guidance` 在基线取代推送中找回但从未激活。所有者判定两者无用，要求删除。

## Decision

两个包连同接线一起删除：根 tsconfig 的 paths 与 references、chaos-bundle 的 patch 行、依赖与 README 行（sandbox-guidance），以及去掉 at-file 组件后重新生成的 client slot catalog。at-file 的 Agent Note 三件套在此删除；本笔记保留移除放弃了什么。

`chaos-at-file` 放弃了：有界工作区索引（5000 文件、依赖目录排除）、文件名优先防重名的选取行、ArrowRight 进目录与面包屑、引用 dock、按工作区的精确与正则文件名过滤、粘贴标记处理——内置 `ui-reference` 达不到的 Codex 式 `@path` 交互。模型可见的 `<workspace-reference>` 标记语法仍由 `chaos-upload` 在生产中持有，范围限于其上传目录。

`chaos-sandbox-guidance` 放弃了：两段系统提示指引——对 `danger-full-access` 会话，"直接带普通参数调用工具，绝不含 sandbox_permissions 或 justification，把 'not strictly wider than this call's current' 当作移除冗余提权参数的信号而非重试提权"；对受限会话，"至多在真实拒绝后重试一次提权，且仅限严格更宽的模式"。习惯包裹提权参数的会话失去了这层纠正。

## Alternatives considered

**两个都留作休眠包。** 否决：fork 为部署证明从不加载的代码承担评审与维护面；死包也过不了每个已组合包都要通过的文档门禁。

**启用而不是删除。** 所有者否决：内置 `@` 引用已覆盖 at-file 服务的需求，指引文本对在用模型没有必要。

## Consequences

两者移除时都不在运行，因此无需重启、无运行时行为变化；本会激活 sandbox-guidance 的 bundle patch 行从未生效过。若再要任一能力，两者都在 fork 的 git 历史里（取代推送已找回过 sandbox-guidance 一次）——恢复意味着还原包及其 glue，而非重写。

## Testing

其余 chaos 测试不变通过（chaos-mobile、chaos-upload、chaos-janitor 共 143 个），两个包的 references 移除后 host 与 client 类型检查聚合干净，重新生成的 slot catalog 不再列出 at-file 的组件。
