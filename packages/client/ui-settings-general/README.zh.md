---
description: "dsh Web 客户端的设置外壳与产品引导：侧边栏设置触发器与对话框面板，基于 settings.section 与 settings.onboarding 名录，无属主的 General 分区及其 settings.general.item 列表，仅限 loopback 的打开配置文件操作，以及持久化的 ui-onboarding 设置命名空间。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-general

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-general` 是设置外壳：它以触发器外观占据 `sidebar.settings`，并把设置面板 portal 到 document body（移动端呈现把该面板变为常驻导航栏之下的整宽页面），同时把 `settings.section` 名录投影为导航。它注册设置页面上不属于任何单一功能的一切——触发器／头部／关闭按钮的外观内容、本地配置文件操作、General 分区及其 `settings.general.item` 列表，以及 `settings` 词典——而功能持有的行、分区与引导步骤仍留在各自的功能包中。`settings.onboarding` 名录按升序投影并一次只挂载一个步骤；活动注册方收到自己的 id、`complete()` 与 `openSection(id)`，持久化完成状态、文案与可见包装都归注册方所有。Host 半边注册 `ui-onboarding` 用户设置命名空间供欢迎步骤持久化，因此外壳本身保持无策略。把功能组合进设置页面或首次运行流程时使用它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 设置外壳的席位

外壳占据 `sidebar.settings`——它渲染进去的 slot 类型属于 ui-settings（设置领域基座）；只有外壳自己的契约类型放在这里，因为它们引用 ui-sidebar 的 slot 类型，而基座层不得依赖任何 `ui-*` 包。触发器行还在触发按钮旁承载连接指示器，其恢复确认在重连后计时。面板只在打开时挂载，并在关闭提交后把焦点还给触发按钮。

### 分区导航

`settings.section` 名录驱动导航行：功能插件以自己的 id、本地化标题与组件贡献一个分区，外壳渲染导航加内容，同一时刻只有一个活动分区。导航标签可以是跟随 locale 的 thunk，因此导航投影经 `resolveSlotLabel` 解析它们，并在名录递增或 locale 修订时重新渲染（可选的 `ctx.get('locale')` 读取；没有硬 locale 依赖）。外壳自己注册的 General 分区在构造上无属主：其行来自 `settings.general.item` 列表，因此每行只在持有它的功能插件挂载时出现。

### 引导流程

外壳不随附任何引导文案——所有文本来自注册方。`settings.onboarding` 名录按升序投影并一次只挂载一个步骤，且仅在会话阶段为 ready 且没有具体会话为当前会话时。可见步骤持有自己的对话框外观与应用根节点 `inert` 生命周期；仍在解析私有事实的已挂载步骤渲染 null，因此决策期间不绘制任何内容也不阻挡任何操作。活动注册方收到自己的 id、`complete()` 与 `openSection(id)` 回调；完成或跳过会把所有权移交给下一个条目。持久化完成状态、能力就绪、文案、变更与可见包装都归注册方所有，因此独立注册的流程不会叠加，外壳也不会成为第二个配置事实源。

### 打开配置文件

loopback 浏览器经 `settings.describe` 加载提供方的 `hasDocument` 能力，只有当 Host 确认可以准备提供方持有的本地文档时才渲染"打开配置文件"。该操作发送无路径、仅限 loopback 的 `settings.openDocument` 请求；Host 再次解析提供方路径，补齐缺席的文档，并交给原生文本编辑器（macOS 上 `open -t`，绕过浏览器文件关联；Linux 与 Windows 上桌面文件关联；WSL 上经 `wslpath -w` 转换后走 Windows 关联）。打开失败保持该操作可用并渲染本地化错误。重新打开对话框或重连都会在瞬时读取失败或 Host 拓扑变化后刷新可用性。远程浏览器不注册该操作，也不发起特权设置读取。

Host 半边在用户设置接缝中注册 `ui-onboarding`。由 `ui-settings-models` 贡献的欢迎步骤经既有公共设置边界读写其 `welcomeNoticeVersion`；外壳本身保持无策略。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节补充模块地图；可观察的席位与流程已在上文说明。

### 设计说明

SettingsRoot 消费组件的 props 由 `sidebar.settings` 注册之上标准四份额派生：框架钩子（用于引导活动状态的 `useSessions`、分区与引导名录 store、连接状态）、用于外观内容与活动引导步骤的 `renderSlot`，以及触发器外观自己的 slot。已完成步骤集合是组件状态——持久化完成归各注册方（欢迎提示持久化其 `welcomeNoticeVersion`），该集合在引导失活时重置。`settings-document-store.ts` 维护设置文档的直写缓存：读取走 store 的缓存快照，保存则直写 `SettingsDocumentSave` 并跟随其后的热重载，因此 Host 接受写入后面板绝不编辑陈旧文档。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 各注册项：外观内容、词典、General 分区、文档操作 |
| [`src/client/SettingsRoot.tsx`](src/client/SettingsRoot.tsx) | 触发器行、面板与引导协调器 |
| [`src/client/shell-contract.ts`](src/client/shell-contract.ts) | 外壳自己的 slot 与 store 契约类型 |
| [`src/client/settings-document-store.ts`](src/client/settings-document-store.ts) | 设置文档直写缓存 |
| [`src/index.ts`](src/index.ts) | Host 半边：`ui-onboarding` 设置命名空间 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当外壳约定不够用时阅读以下页面。

- [ui-settings](../ui-settings/README.zh.md)——持有 slot 类型的设置领域基座。
- [ui-settings-models](../ui-settings-models/README.zh.md)——Models 分区与欢迎步骤注册方。
- [ui-sidebar](../ui-sidebar/README.zh.md)——本外壳占据其设置席位的导航列。
- [settings](../../settings/settings/README.zh.md)——`settings.describe` 与 `settings.openDocument` 背后的用户设置能力。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该插件渲染浏览器设置界面；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明外壳自身提供什么、功能必须提供什么；它们是当前包约束。

- **General 分区没有内建行**——每行只在持有它的功能插件挂载时出现；仅凭外壳无法填充分区。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。设置接缝校验并发布持久化引导分区，slot 冲突在 slot 核心处显式失败。本地文档操作是建立在带类型 RPC 响应之上的浏览器状态，由 store／组件测试覆盖，而非 Cordis 运行时关系。
