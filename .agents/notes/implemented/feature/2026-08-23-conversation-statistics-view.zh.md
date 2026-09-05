# Agent Note: conversation statistics view

Status: implemented

[English](2026-08-23-conversation-statistics-view.md) | 中文

## Problem

输入框下方的紧凑统计行便于快速查看已完成轮次，但会随着会话累积的耗时、吞吐、缓存和 Token 数据而截断。对话检查需要一个稳定的位置展示这些持久数据，且不能挤占 Chat 转录或轨迹账本。

## Decision

对话视图环在 Chat 和 Trajectory 后加入 `statistics` 条目。`UsageReport` 将浏览器的 IANA 时区传给宿主 `usage-report.read` 对每份可读取持久化会话日志中已完成提供方请求的投影。宿主仅在持久化日志 revision 和本地已完成请求事件未变化时复用已完成的报表；标签页在后台刷新时会展示连接端点和查看者时区的上次报表。其卡片展示全历史总量，30 天查看者本地日历图则保留中性灰色的零用量日期，并按 provider/model 路由堆叠每天的真实 Token。选中的图表日期会展示其 Token、请求数和模型分段，无须在每根柱子下重复日期标签。标签页在前台时每 30 秒刷新持久数据，切回页面和每个本地日期边界也会刷新。紧凑的输入框统计行仍使用当前会话的 `sessionStats` 和 `tokenUsage` 投影。

## Alternatives considered

**只保留输入框下方的统计。** 单行格式适合快速状态查看，但在宽度有限时必须截断，无法独立呈现每个指标。

**把统计加入轨迹视图。** 轨迹负责请求级检查和时间线控制；合并会增加该诊断视图的负担，也会让 Chat 用户难以发现汇总。

## Consequences

该标签页的报表请求宿主端全历史折叠结果，而非把会话累计值分配到会话更新时间。折叠读取持久化 `assistant/message.usage` 记录的事件时间，并将每条记录归因到其前面的持久化 `request/context` 所记录的 provider 和 model。前面没有上下文的用量记录会明确保留为未归因。输入框仍保留既有单行摘要，用户在编辑时仍可看到关键数值。

当前不展示成本，因为请求发生时的实际价格没有持久化。价格功能必须在每条已完成请求中记录所应用的价格，不能使用当前价格回填历史。
