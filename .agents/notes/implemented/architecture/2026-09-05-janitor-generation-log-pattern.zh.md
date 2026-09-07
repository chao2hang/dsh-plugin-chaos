# Agent Note：Janitor 世代日志模式匹配两种压缩写法

状态：已实现

[English](2026-09-05-janitor-generation-log-pattern.md) | 中文

## 问题

`packages/extensions/chaos-janitor/src/sweep.ts` 的 `GENERATION_LOG_PATTERN` 接受 `session.vN.zstd` 与 `session.vN.jsonl`，但 jsonl 持久层把带版本号的世代日志写成 `session.vN.jsonl` 加可选 `.zstd` 后缀（`session.vN.jsonl.zstd`）。默认压缩写入的会话因此持有一份被清扫器判为外来内容的世代日志，无论超出 `maxArchivedDays` 多少天，`sweepArchivedSessions` 都不删除这些目录。

## 决策

模式改为 `/^session\.v\d+\.jsonl(?:\.zstd)?$/u`，与持久层实际的 `generationLogFilename` 两种写法（plain 与 zstd）都匹配。`KNOWN_LOG_NAMES` 本就列出了非版本日志的两种写法，带版本号的家族现在与它一致。回归测试 `sweeps version-tagged generation logs in either compression spelling` 端到端覆盖两种形式。

## 考虑过的替代方案

- 与 jsonl 持久层包共享同一文件名文法：拒绝——清扫器必须独立于它审计的持久实现；在模式旁的注释里复述两种已提交的写法，让耦合可见而不引入导入。

## 后果

清扫现在会删除世代日志使用默认压缩写法的归档会话——这本就是插件文档写明的契约；此前被跳过的目录会在下一次清扫时按龄删除。带有真正外来文件（两种已知名称与带版本号家族之外的任何内容）的会话仍被跳过以待人工审查。

## 测试

`npx vitest run packages/extensions/chaos-janitor/tests/sweep.spec.ts`——9/9，包括带版本号世代日志的两种压缩写法。
