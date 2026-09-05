---
description: "面向手机的 Web GUI 浏览器侧移动适配：768px 断点以下的抽屉导航、44px 导航栏、底部 sheet、触控目标、键盘跟踪与附件选择器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-mobile

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-mobile` 在不替换状态所有者的前提下，为手机适配 Web GUI 现有的三栏布局。在移动视口下，它叠加一条 44px 导航栏，把侧边栏变为滑入抽屉、详情列变为全屏推进页，并把 Modal 和 Menu 呈现为可在中、大两档停靠高度之间拖拽的底部 sheet。44px 触控目标、安全区内边距、让输入栏贴住键盘的 Visual Viewport 跟踪，以及拍照、图片、附件三选一选择器，共同改善触屏体验。桌面宽度保留 ui-layout 未修改的框架；本插件无配置，也没有面向模型的表面。

## 目录

- [使用本包](#use-this-package)
- [组合](#composition)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 GUI 需要在手机上可用时，随 Web profile 挂载本插件；仅桌面布局时不挂载。移动外壳接管宽度低于 768px 的视口，以及矮横屏视口（高度低于 500px，三栏网格放不下时）；overlay 会标记 `<html data-chaos-mobile>`，让每条 CSS 规则都基于同一次测量判定。在这些宽度下，该插件在不替换状态所有者的前提下适配现有布局：

- 44px `MobileNavBar` 取代浮空汉堡和关闭按钮：左侧显示菜单开关（详情面板打开时显示返回按钮），中间显示当前会话标题，右侧显示单个溢出按钮。
- 侧边栏变为带背景遮罩的滑入抽屉，通过导航栏菜单开关或左边缘右滑打开，通过遮罩、开关或左滑关闭。
- 详情列变为全屏推进页；导航栏返回按钮与系统返回键通过 overlay 持有的同一个历史条目关闭它。
- `MobileSheet` 将 Modal 和 Menu 呈现为 iOS 风格的玻璃面板：可访问的拖拽把手可在中等和大停靠高度之间切换，向下拖拽足够距离才关闭；它还通过 ui-primitives 的 `SurfacePresentation` 接缝提供滚动锁定和焦点陷阱。
- `Tooltip` 在移动端完全抑制气泡（触屏设备无悬停）。
- 安全区内边距、动态视口高度和 44px 最小触控目标改善触屏体验。
- 通过 Visual Viewport API 持续跟踪可见高度和垂直偏移，输入栏在移动端键盘导致视口平移时仍贴住可见底部。
- 输入栏的回形针按钮打开三选一菜单：拍照、图片、附件。每次选择都进入会话的统一附件接收流程——`createDrafts` 把图片转为带预览、随提示发送的图片草稿，把文档转为立即开始后台上传的文件草稿；`addAttachments` 把它们加入输入栏草稿，被拒绝时释放草稿。附件选择器保持只接受文档的 `accept`（`application/*,text/*`）——不设 accept 的文件输入会让部分手机浏览器弹出相机/相册面板而非文件选择器。
- 溢出按钮打开一个 sheet，收纳没有其他移动端入口的操作：新建会话、打开详情面板、打开工具面板、在对话与轨迹视图之间切换，以及当前会话统计。
- 桌面设置弹窗在移动端呈现为专用页面：它持有表面时，导航栏显示 设置 标题，返回按钮关闭该页面。
- CSS 针对稳定的 `data-shell-column`、`data-shell-frame`、`data-shell-handle` 和 `data-conversation-session-header` 锚点编写选择器——不使用 `[class*=]` 哈希类名选择器。

桌面宽度保留 ui-layout 未修改的三栏框架、拖动手柄和列求解器；overlay 不渲染任何内容，并把表面呈现重置为 inline。

### 无需配置

本插件没有 Config 接口。从 Web profile 的 `cordis.patch.yml` 中移除 `chaos-mobile` 一行即可使用不带移动适配的桌面布局。

-----

<a id="composition"></a>
## 组合

节点半包的 `apply` 为空——它只为 Loader 提供一个宿主侧行，浏览器半包经 `exports["./client"]` 发布。浏览器半包声明 `slots`、`conversation`、`layout`、`uiWorkspace` 和 `sessions` 为必需服务，将 `MobileOverlay` 添加到 ui-layout 的 `shell.overlay` slot，并将 `AttachmentButton`（id 为 `chaos-mobile-attachment-picker`）添加到 `conversation.input.left`。overlay 注册从 `ctx.layout` 与工作区导航注入 `toggleSidebar`、`openDetails`、`closeDetails` 和 `newSession` 动作；附件注册向按钮注入一个 `conversation` 适配器——`createDrafts` 与 `releaseDraftAttachments` 转发给会话控制器，`addAttachments` 与 `notify` 依 slot 的会话 id 解析会话作用域。挂载时，overlay 调用 `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` 为所有 Modal/Menu/Tooltip 实例激活 `MobileSheet` 呈现器；卸载或桌面端时调用 `resetSurfacePresentation()`。它还会在插件生命周期内注入全局移动样式表。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该浏览器侧插件不注册模型上下文或工具 schema。

#### KV Cache 影响

该插件不改变模型请求，因此不增加 token 也不改变 KV Cache 复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明移动适配在何处依赖其他包或发生降级。它们是当前包约束，不是任务积压。

- **布局选择器**——抽屉和 sheet 的 CSS 针对 ui-layout 的稳定 data 属性（`data-shell-frame`、`data-shell-column`、`data-sidebar-collapsed`、`data-details-collapsed`）；这些属性的变更需协同更新。
- **Sheet 呈现是可选接缝**——`setSurfacePresentation` 以可选形式读取：ui-primitives 缺少该增量 API 的组合会退回 inline 呈现，而不是渲染底部 sheet。
- **导航栏模式芯片没有数据源**——宿主 summary 不投影逐会话的 agent preset，因此导航栏中间只显示会话标题；在出现数据提供方之前，该芯片保持未用。
- **移动端界面文案是插件自有的中文**——导航栏与溢出 sheet 的标签以及附件选择器渲染固定字面值，而非 locale 字典。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包只提供浏览器呈现；面板状态及其可观察的状态转换归 ui-layout 所有。
