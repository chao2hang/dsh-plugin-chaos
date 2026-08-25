# Agent Note: Chaos think 标签渲染保留现有 reasoning 展开项

Status: implemented

[English](2026-08-25-chaos-think-tag-reasoning-rendering.md) | 中文

## 问题

部分 OpenAI 兼容的国产模型网关会把 reasoning 作为带 `<think>` 分隔符的普通 assistant text 输出。对话 renderer 只识别结构化 reasoning block，因此分隔符及其内容会作为可见回答文本显示，无法进入默认折叠的 Think 展开项。

## 决策

`@deepseek-ai/dsh-plugin-chaos-think-tags` 通过 Chaos bundle 替换现有的 `assistant-step` keyed renderer。它合并相邻 text block，并把匹配的 `<think>…</think>` 区域内文本映射到现有 reasoning-block 呈现。被包裹的 renderer 保留已有的 markdown、图片、工具、操作、locale 与 turn-tail 行为。

该转换只发生在浏览器呈现层。provider event、session history、导出、重试与模型上下文保留 provider 原始 text block。未闭合的起始分隔符会将该 assistant step 的余下内容放入 Think 展开项。

## 曾考虑的替代方案

**修改核心 provider stream adapter。** 否决：网关专用的分隔符兼容属于可选 Chaos 组合，不应为所有部署改变共享 provider protocol。

**只在 Markdown 渲染中移除标签。** 否决：这会绕开既有 Think 交互，形成第二条 reasoning 呈现路径，其流式和无障碍行为也会不同。

**把所有字面 `<think>` 都当作普通文本。** 否决：受影响 provider 将该分隔符作为 reasoning protocol。需要展示字面标签示例的部署可移除可选 Chaos 行。

## 后果

受影响 provider 的响应会在与结构化 reasoning 输出相同的可折叠、可展开 Think 行中显示 reasoning。兼容层可通过 Chaos bundle patch 移除，不会改变持久对话数据。相邻流式 chunk 会一起解析，因此跨 chunk 边界的分隔符不会泄露到可见回答中。

## 测试

`packages/extensions/chaos-think-tags/tests/think-tags.client.spec.ts` 覆盖完整带标签输出、分隔符跨相邻 text block 拆分，以及与原生 reasoning block 共存的情况。已有 `ReasoningRow` 测试继续固定 Think 展开项交互。
