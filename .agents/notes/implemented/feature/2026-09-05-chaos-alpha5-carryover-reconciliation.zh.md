# Agent Note：把 master 线的插件工作搬运到 chaos alpha.5

Status: implemented

[English](2026-09-05-chaos-alpha5-carryover-reconciliation.md) | 中文

## 问题

alpha.5 迁移（`update/dsh-0.1.2-alpha.5`）与 alpha.3 迁移在同一分钟内从同一棵过期的树切出，但 [janitor、upload、sandbox-guidance 的工作](2026-09-04-chaos-fork-baseline-supersession.zh.md)一天后落在了 alpha.3 线（`origin/master`）上。alpha.5 分支因此少了三个 chaos 插件和 tsdown 根项目修复——正是 alpha.3 supersession 笔记警告过的过期树失败模式，只是方向相反：这次缺内容的是本地分支，不是远端。

## 决策

把 `e790c3274a`（三个插件及其笔记）和 `4a0c0b50fe`（tsdown 修复）cherry-pick 到 alpha.5 分支，再与 alpha.5 基线和解：

- `SessionHeader` 在 alpha.5 增加了必填的 `isSeeded` 成员；janitor 与 sandbox-guidance 的夹具将其设为 `false`（普通会话，无 fork 继承）。
- `conversation.input.left` 在 alpha.5 的 slot API 中失去了 `session` prop。附件按钮改为读取标准 props 的 `sessionId` 成员，`notifyInput` 接线先通过 `ctx.sessions.scope(sessionId)` 解析会话作用域再调用 `conversation.input.for(actx)`——继承来的根上下文 `for(ctx)` 调用在 alpha.5 会抛错，因为 `input.for` 要求会话作用域。`chaos-mobile` 的 `inject` 增加 `sessions`。
- alpha.5 的 invariant companion 审计同样适用于搬运来的包：三个空 companion、它们的 `./invariant` 导出、tsconfig 引用、构建入口、`dsh-invariants` 依赖以及 sandbox-guidance 的 invariant spec 一并移除，不发 companion 的理由以 Runtime invariant 行写入各自 README。
- README 合规：janitor 加入模型体验单句允许清单；sandbox-guidance 以其 `chaos:sandbox-escalation` 段落锚定规范条目；upload 的三个字段归入 H3 标题之下；bundle README 以双语组合四行并重新记录配对。
- `uploadReferenceForm` 补上导出要求的 `@param`/`@returns`。

## 考虑过的替代方案

**合并 `origin/master`。** 否决：远端在 alpha.3 基座上，合并会把约 2500 个文件的基座分歧拖过这两个提交已经点名的内容。

**从当前树重新切迁移。** 否决：alpha.5 分支已带有审计提交；搬运两个可枚举的提交比重做迁移并重新审计更小。

## 后果

分支现在携带完整的 chaos 集合（含 bundle 共十一个扩展包）。既有的门禁失败不因本次搬运改变——已在父提交上验证一致：`api`/`api/session-controller` 的 README 配对漂移、旧 chaos 包与 `ui-theme` 的十七处 export-JSDoc 缺口、以及 web-app bundle 各 chaos 行的七处 `verify-cordis-config` 路径映射。未来从过期树切出的迁移仍需要同样的审计；本笔记是 alpha.5 一侧的记录，证明该警告是对称的。

## 测试

Host 与 client 的 typecheck 聚合干净；全部 459 个 extension 测试通过（462 减去移除的 sandbox-guidance invariant spec）；jsonl 持久化套件的 258 个测试通过；两个构建面产出，且 `verify-package-invariants`、`verify-built-package-invariants`、`verify-package-readme-model-experience`、`verify-package-readme-limitations`、`verify-cordis-config` 与所涉包的配对检查全部合规。
