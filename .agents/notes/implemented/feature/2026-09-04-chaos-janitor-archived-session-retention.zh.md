# Agent Note: Chaos-janitor 归档会话保留

Status: implemented

[English](2026-09-04-chaos-janitor-archived-session-retention.md) | 中文

## Problem

Web GUI 唯一的会话生命周期手势是归档：工作区 registry 把归档会话从所有分组表面隐藏，但保留其日志，而产品没有任何删除会话的通路——删除工作区也只移除 registry 记录。归档的会话日志因此在会话根目录下永久累积，用户希望归档后的会话在一定期限后自动清理。

## Decision

`@deepseek-ai/dsh-plugin-chaos-janitor` 以纯 Host 的 chaos 插件拥有归档会话保留，由 Chaos bundle 挂载且 `maxArchivedDays: 0`（删除需显式开启）。每一轮读取 registry 持久化的 `archivedSessionIds`，经 `ctx.sessionPersistence.list()` 列出会话头，然后删除每个日志文件 mtime 超过配置年龄的归档会话的目录——跳过仍在会话存储中存活的、日志读不到的、或目录里除已知日志文件外还有其他内容的会话，并且从不改写 registry：registry 本来就会过滤日志已消失的会话。

会话路径来自 jsonl 持久化的布局契约。该包的 index 现在从 `format.ts` 重新导出 `sessionDir`/`logPath`/`projectDir`/`projectKey`/`logSuffix`，清理器经拥有方包推导每个路径而不是重新编码目录命名；会话根目录经 `dsh-home-paths` 的 `dshHomePath('sessions')` 解析。

清理器没有显式保留值就不运行，支持 `dryRun` 预演取值，并在启动五秒后跑首轮而不是等满一个间隔。

上传文件的保留归其拥有方：`chaos-upload` 增加了 `maxAgeDays`（默认 0），在会话持久化已知的每个工作区里删除超过年龄的平铺上传文件，绝不删除目录。

## Alternatives considered

**在核心里做会话删除 seam。** 本次否决：正确的产品表面要在多个核心包里加持久层删除、registry forget 和 GUI 接线；Chaos profile 的清理器经现有公开读（registry 集合、会话头列表、会话存储活性）加上现已导出的布局契约达到同样效果。

**带时间戳的归档年龄。** 否决：registry 不记录归档时间，为此加一个是持久化状态迁移，而 mtime 已经给出边界——归档会话绝不会比真实归档年龄更年轻时被删（mtime 早于归档），存活期间绝不删除。

**随引用会话一起删除上传。** 否决：上传按工作区而非按会话存在——同一工作区的多个会话共享 `uploads/`，归属需要按会话分子目录并让 `@path` 提及明显变长。按年龄保留保持提及形状不变。

## Consequences

保留按年龄计且对引用不敏感：超过年龄的上传或归档会话即使之后仍被提及也会被删除——上传标记退化为普通文本，归档会话从所有列表消失。只有已删除会话引用的图片附件仍留在附件库里成为孤儿字节，直到出现附件保留机制。registry 的 `archivedSessionIds` 累积已删除会话的 id；它们是惰性的（缺失会话从所有分组表面过滤）但不会被清理。布局耦合是显式且导入的：jsonl 后端若改变目录命名，清理器跟随导出的契约，或安全地找不到日志。

## Testing

`packages/extensions/chaos-janitor/tests/sweep.spec.ts` 在临时会话根上用真实布局函数覆盖静默/存活/新鲜/日志缺失/外来内容矩阵、关闭的保留、dry-run 预演和 `_no-cwd` 目录。`packages/extensions/chaos-upload/tests/sweep.spec.ts` 覆盖上传保留：超龄删除、新鲜文件与子目录保留、关闭的保留和 dry-run。
