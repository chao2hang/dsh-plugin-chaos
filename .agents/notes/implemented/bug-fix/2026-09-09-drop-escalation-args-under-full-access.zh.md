# Agent Note：丢弃 danger-full-access 调用用不上的升权参数

状态：已实现

[English](2026-09-09-drop-escalation-args-under-full-access.md) | 中文

## 问题

用其他提供方模型驱动 DSH 工具 schema 时，模型经常把每个可选字段都填上：`bash`、`pwsh`、`write`、`edit` 的调用在第一次尝试就携带 `sandbox_permissions` 与 `justification`，事前没有任何拒绝。当会话已运行在 `danger-full-access`（部署默认值或运行时模式切换）下时，这条升权路径必然失败：`WIDER_MODES['danger-full-access']` 为空，`approveEscalation` 在提示任何人类之前就以 `sandbox escalation to "<mode>" is not strictly wider than this call's current "danger-full-access" mode` 拒绝每个请求。这类模型无法把该错误映射为「别再发送这些字段」，而是带着相同参数重试，在剩余轮次预算里陷入循环——而会话本就运行在重试所声称需要的最宽模式上。

## 决策

升权参数改为在执行边界规范化，即各工具解析出本次调用常设策略之后——不再在静态参数校验阶段进行：

- `normalizeEscalationArgs(sandboxPermissions, justification, effectiveMode)` 加入 `dsh-sandbox` 的共享升权词汇。常设模式为 `danger-full-access` 时两个字段都被丢弃——升权既不可能也不必要——执行按常设模式继续。更窄或未解析的模式下，共享配对规则（`sandbox_permissions` ⇔ `justification`、非空）原样强制。
- `dsh-tool-bash`、`dsh-tool-pwsh`、`dsh-tool-fs`（`write`/`edit` 共享的 `FsSandboxController.resolvePolicy`）把各自的 `validateEscalationArgs` 调用从静态参数校验移入这一解析后步骤，传入刚解析出的 `standingPolicy.mode`。

`approveEscalation` 不变：严格加宽、审批路由与故障关闭的结果映射保持原有顺序与文本，受限会话看不到任何行为差异。被丢弃的请求永远不会提示人类。

## 考虑过的替代方案

**保持失败关闭并指望模型自行纠正。** 拒绝——错误命名的是一个不可能的升权，不是模型可采取的动作；观测到的外部模型行为是无条件重试循环，而非恢复。

**组合默认为全访问时停止声明升权字段。** 拒绝——schema 是注册表全局的，而生效模式是逐会话的——被覆写为窄于全访问默认值的会话会失去唯一的杠杆。[沙箱决策](../feature/2026-07-06-sandbox.zh.md)为枚举保持封闭目标词汇记录了同一条理由。

**允许 `danger-full-access` 升权到自身。** 拒绝——这会让顶档的严格加宽检查空洞化，且授予调用并不缺少的权限。这些参数是噪点，噪点应被丢弃而不是被采纳。

**把整个检查折进 `approveEscalation`。** 拒绝——丢弃必须发生在考虑审批之前，否则配对错误会在两个强制工具族的不同管线阶段浮现；一个共享的边界函数让两者的顺序完全一致。

## 后果

模型投机填写升权字段时，`danger-full-access` 会话照常执行，而不是在无法行动的拒绝上循环；没有更宽的模式，所以什么都没有放宽。全访问下畸形的配对（只有其中一个字段）随其余参数一起被丢弃。受限模式不受影响：配对校验在那里仍然失败关闭，受限模式下的非加宽请求仍以各自文本失败且不提示任何人。三个工具的静态校验器不再检查升权配对，因此非升权字段的参数校验顺序不变。

## 测试

`dsh-sandbox` 中 `normalizeEscalationArgs` 的单元测试固定全访问下的丢弃、更窄与未解析模式下的透传、以及配对强制。`dsh-tool-bash`、`dsh-tool-pwsh`、`dsh-tool-fs` 的工具级回归在 `danger-full-access` 会话下运行投机升权，断言调用无错误并按常设模式执行。
