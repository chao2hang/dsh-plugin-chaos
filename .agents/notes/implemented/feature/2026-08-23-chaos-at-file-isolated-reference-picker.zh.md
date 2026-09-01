# Agent Note: Chaos 自有的工作区引用选择器

Status: implemented

[English](2026-08-23-chaos-at-file-isolated-reference-picker.md) | 中文

## Problem

Web bundle 已提供组合的 `@file` 与 `@session` 引用来源。Chaos profile 需要完整的 dsh-at-file 交互：有界文件系统索引、目录导航、文件名过滤、引用栏、粘贴处理，以及模型步骤前的仅存在性标记。两个来源同时注册会产生重复候选和两套文件系统索引。

## Decision

`@deepseek-ai/dsh-plugin-chaos-at-file` 拥有 Chaos profile 的文件引用交互。Chaos bundle 禁用 `ui-reference`，并以 `chaos-at-file` 挂载该插件。

该包保持 Host 与 Client TypeScript 程序分离。Host 服务直接注册范围受限的 Typert invocation；Client 仅为工作区搜索挂载该 contribution。这样 Host TypeScript 程序不会耦合到 Web Client 的 Cordis context 声明。

Host 在 `agent/pre-step` 确认每个相对 `@path`，并追加一条 `workspace-reference` 用户消息，其中只含路径和文件或目录类型。agent loop 与其他 pre-step 消息一起记录该消息，因此回放可以重建模型可见标记。浏览器不会从索引请求获取文件内容。

窄屏样式将选择器限制在可视视口中，使引用标签占用输入框宽度，并将可交互控件提升至移动端触控目标尺寸。

## Alternatives considered

**复用内置 `ui-reference` 来源。** 它避免第二个选择器，但缺少所需的过滤设置、引用栏、精确排序、目录导航和每引用标记。

**同时保留两个 `@` 来源。** 每次选择器请求都会显示重复文件候选并重复文件系统工作。

**添加私有 HTTP 设置和搜索 API。** Harness settings scope 与 Typert Remote 已提供生命周期归属、冲突处理、取消和浏览器挂载；私有路由会重复这些能力。

## Consequences

启用该 bundle 时，Chaos profile 不提供 `@session` 补全，因为组合来源的文件半部分一并被禁用。后续可以添加独立 session-reference 来源，而不重新启用 `ui-reference`。

引用标记只在步骤准备时证明路径存在，不证明后续工具调用仍可访问。部署必须让 Host 工作区索引与模型可见的文件系统命名空间保持一致。
