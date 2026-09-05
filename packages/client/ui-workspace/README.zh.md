---
description: "dsh Web 客户端的工作区浏览器与选择器：sidebar.workspaces 中的分组与扁平会话列表（逐账号排序与归档）、上限 20 的防抖内容搜索、带 directory-flow 子洞的页面本地 hero 选择器，以及 pending 交互与 subagent 血缘的行状态。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace

[English](README.md) | 中文

## 概述

`dsh-client-ui-workspace` 是共享的工作区浏览器与选择器插件：`WorkspaceBrowser` 填充侧边栏的 `sidebar.workspaces` slot，`WorkspacePicker` 填充页面本地会话意图 hero 的 `conversation.hero.workspace` slot，两者使用同一套工作区菜单与添加流程。浏览器从全局 runtime 钩子渲染分组或扁平的会话行，持有工作区添加／重命名／重排以及会话重排，并为每个账号维护一份浏览器持久化的会话顺序；折叠态搜索在其上叠加即时标题匹配与 250ms 防抖、上限 20 条的 Host 内容搜索。选择器经 directory-flow 子洞（由组合进来的拾取包填充）为每次流程恰好采纳一个被选中的目录路径，并在选中已提交的工作区前等待其列表投影刷新。行承载实时 pending 交互分类、移动端滑动暴露的管理控件、复制被行截断值的悬浮卡片，以及从运行中 subagent 后代继承的蓝色活动指示。组合需要列出、打开或创建会话的界面时使用它。

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

两个目标 slot 都由其他插件声明，因此 `apply` 使用 `slots.inject()` 为每个声明生命周期注册，并在声明 slot 被恢复后重新注册。

### 浏览与排序

一个工作区记住自己是关闭还是正在显示会话；打开的工作区默认显示五个会话，为其余会话提供一个瞬时的"显示更多"控件，并在整个工作区关闭再重新打开后回到五条。从工作区行创建会话会先打开该分组，使新行在会话状态到达时仍然可见。工作区列表基线就绪后，浏览器持久化的展开与会话顺序记录只保留当前工作区 id，加上 Ungrouped 与扁平列表账号。视图选项把分组与每账号一份浏览器持久化的会话顺序结合：真实工作区从 `WorkspaceView.sessionIds` 初始化，而 Ungrouped 与跨工作区扁平列表从最近使用初始化。**手动**与**最近更新**在两种呈现下都可用。进入"最近更新"会执行一次完整的最近排序，此后的用户 prompt 或引导各提升其会话一次；进入"手动"则保留当前所有位置，并禁用之后的提升。两种模式下拖动都会编辑当前顺序；真实工作区的手动模式拖动还会更新 Host 会话账目，而 Ungrouped 与扁平列表顺序保持在浏览器本地，因为二者都没有单一工作区账目。扁平行省略空的前导状态槽，因为它们没有父级层级，但当会话状态可见时保留该槽。工作区拖动顺序在任一会话顺序模式下都是 Host 持久化的。

### 行操作

工作区行的删除操作打开一个说明保留边界的确认对话框，阻止重复提交并保持失败状态可见；成功后移除该分组，其会话仍保留在 Ungrouped 下。会话行的重命名操作打开同一浏览器自有的对话框模式，并预填该行的显示标题：没有客户端冲突规则（Host 会归一化，并可能以 `title-invalid` 拒绝，在对话框警告中呈现），确认未更改的标题是被有意允许的——它把当前自动标题钉住，阻止再生成。会话行的归档操作不经确认对话框直接提交（非破坏性：日志与工作区账目槽保留），经 `ctx.workspaces.archiveSession` 完成；当归档集回执到达时，该行从所有分组界面消失——工作区分组、Ungrouped、内容搜索与扁平列表——失败则是控制台诊断，树保持不变。空白的新会话行是纯占位符：它不渲染行菜单也不渲染时间标签（其中尚未发生任何事），因此重命名、fork 与归档都要等到第一条 prompt 落地后才可用。所选会话行的菜单还提供"下载日志"操作，在 `sessionLogDownload` 服务存在时把会话 id 交给它。Fork 操作在源会话最后一个已完成回合处 fork，在客户端递增继承的持久化标题，然后打开子会话；结尾的 ASCII 或全角括号数字以同样风格递增，未编号的标题则追加 ` (1)`。源会话与子会话总是作为同级行出现在工作区分组内，血缘仅保留为会话数据。fork 或重命名失败会保持当前选择不变；重命名失败后，已创建的子会话仍保留在列表中。在移动视口上，刻意的水平滑动会显示既有的会话管理控件，而不依赖仅悬停可见的省略号：右滑为重命名与 Fork，左滑为归档。归档在持久化注册请求完成前立即隐藏该行，请求失败则恢复它。垂直或短手势不改变该行，滑动绝不打开会话；空白的新会话占位符不显示这些控件。

### 搜索

折叠态搜索是视图与添加操作旁的一个头部操作。在控制栏中，添加与搜索以 36px 控件呈现在外壳共享的水平入口路径上。激活搜索会把输入框扩展到整个头部；外部点击只折叠修剪后为空的查询——轨道搜索手势仍在进行时除外（直到列滑动后焦点落入输入框），使展开点击无法关掉它打开的搜索——清除控件则总是重置并折叠。非空搜索查询会把任一浏览模式替换为一个扁平结果列表：不区分大小写的标题与工作区子串匹配立即出现，而 250ms 防抖的 Host 请求补充排序后的当前对话内容匹配与摘要。英文搜索输入及其防御性请求路径会移除 NUL、把查询限制在线协议 schema 的 500 个 UTF-16 码元内且不拆分代理对，并保留既有的防抖与取消行为。每个新查询都会中止前一个请求；内容搜索失败时保留元数据匹配并显示警告。列表上限为 20，提示用户缩小过宽的查询，打开所选会话时不清除查询，也不跳转到特定事件。

### 工作区选择器与目录流程

选择器通过全局 `useWorkspaces` 钩子列出真实的 Host 工作区实体。选择一个工作区会调用 slot 持有方的 `onPick` 回调，重新定向前端会话对象。不同的规范路径在其基名与显示标题相同时仍保持为按 id 区分的工作区；侧边栏悬浮详情把 POSIX 主目录或其后代显示为 `~`／`~/…`，Windows 路径则原样保留。每个注册声明一个 directory-flow 子洞（`single` 类：`conversation.hero.workspace.directoryFlow`／`sidebar.workspaces.directoryFlow`），由组合进来的拾取包的客户端半边以其拾取交互填充——今天是 [`-native`](../../host/directory-picker-native/README.zh.md) 后端的无人值守 OS 选择器驱动，在 `-browse` 组合下则是应用内浏览对话框。扁平的"添加工作区……"操作只在所属界面的洞被占用时渲染（占用情况按每次菜单渲染读取；空洞意味着该组合没有拾取能力——即接缝文档化的无流程默认，此时侧边栏头部直接去掉添加按钮，而不是提供一个死按钮）。本包持有触发器与采纳：占用方经洞的持有方会话（`open`／`busy`／`onPicked`／`onCancel`／`onError`）为每次打开报告一个被选中的路径，持有方经对象层采纳它，且只在已提交工作区的列表投影刷新后才选中它；取消是静默的，错误进入可重试的文件夹对话框，其"重新选择"会重启流程。添加只有一条路径：占用方自己的新建文件夹能力已经覆盖全新目录，因此没有单独的按名创建对话框。菜单只出现在确有可选之处——没有列出任何工作区时，锚点手势直接拉起流程而不是单行弹层，并且它先等待列表基线，再把空列表当作最终结果。运行时会话与工作区服务持有物化。

### 行状态与悬浮卡片

会话行渲染运行时实时的 `pendingInteraction` 分类：审批显示"等待审批"，计划评审显示"计划待评审"，普通提问显示"等待回答"。每个 pending 交互使用优先于运行指示的琥珀色警示点；普通行在其悬浮卡片中重复本地化状态，普通行与搜索结果行都把同一文本作为视觉隐藏标签提供给辅助技术。运行中使用蓝色指示及其隐藏标签；空闲行保留的状态槽留空。工作区与会话悬浮卡片复制其行截断的值：激活工作区卡片写入其完整目录路径，激活非空会话卡片写入其完整显示标题。临时的空白新会话卡片保持只读，因为其本地化标签是占位符而非会话内容。卡片只在浏览器接受剪贴板写入后才报告词典驱动的已复制状态。共享侧边栏投影隐藏持久化会话摘要中 `origin: 'subagent'` 的行；用户经所选父会话的 subagent 头部目录进入这些对话。每个可见的普通行在经不间断 subagent 血缘可达的任何后代运行时继承蓝色活动指示，其悬浮与辅助文本报告精确的运行中后代数量，而不会把空闲父行描述为运行中。普通 fork 保持可见并终止此聚合，因为仅血缘不设置其 origin。pending 交互优先于会话自身的运行状态，二者之一始终作为行主状态，而后代活动作为单独的悬浮与辅助状态保持可用。两者都不存在时，后代活动优先于绿色的未查看完成提醒；一旦没有后代运行，提醒即恢复。运行时使隐藏行仍可用于对话、标题与被寻址的传输状态。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节补充状态与模块地图；可观察的流程已在上文说明。

### 设计说明

浏览器持久化位于一个快照 store（`stores.ts`），键为 `dsh.workspace.view.v5`，加上扁平列表顺序自己的本地存储条目：视图选项、展开状态与每账号会话顺序跨重载保留，而从 Host 列表消失的工作区 id 会在记录中老化淘汰。搜索状态刻意保持瞬态——折叠的搜索不保留任何内容，打开结果也不清除查询。subagent 血缘聚合是运行时血缘事实之上的纯索引（`subagent-lineage.ts`），因此行投影不含遍历逻辑。`ctx.uiWorkspace` 的动词（`navigation.ts`——`connectWorkspace`、`startSession`、`archiveSession`、`pickDirectory`、`listDirectory`、`createDirectory`）是对象层之上的薄 inject 回调，因此组件绝不触碰服务。两个 slot 都由其他插件声明；`apply` 使用 `slots.inject()`，使每个注册恰好存活于声明 slot 的声明周期内，包括重声明后的重新注册。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/rows/WorkspaceBrowser.tsx`](src/client/rows/WorkspaceBrowser.tsx) | 分组／扁平列表、搜索、视图选项与行操作 |
| [`src/client/rows/Rows.tsx`](src/client/rows/Rows.tsx) | 会话与工作区行的呈现、滑动、悬浮卡片 |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | directory-flow 子洞的持有方会话类型 |
| [`src/client/stores.ts`](src/client/stores.ts) | `dsh.workspace.view.v5` 浏览器持久化 store |
| [`src/client/subagent-lineage.ts`](src/client/subagent-lineage.ts) | 继承活动背后的运行中后代索引 |
| [`src/client/navigation.ts`](src/client/navigation.ts) | 对象层之上的 `ctx.uiWorkspace` 动词 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当浏览器约定不够用时阅读以下页面。

- [workspace-controller](../../api/workspace-controller/README.zh.md)——`ctx.workspaces` 背后的 Host RPC。
- [ui-sidebar](../ui-sidebar/README.zh.md)——本浏览器填充其工作区席位的导航列。
- [ui-conversation](../ui-conversation/README.zh.md)——本选择器填充的页面本地 hero 席位。
- [directory-picker-native](../../host/directory-picker-native/README.zh.md)——占用 directory-flow 洞的 OS 选择器驱动。
- [原生工作区目录拾取](../../../.agents/notes/implemented/feature/2026-07-27-native-workspace-directory-picker.zh.md)——流程设计。

-----

<a id="model-experience"></a>
## 模型体验

无，因为选择器是浏览器外观；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明浏览器与选择器界面不尝试什么；它们是当前包约束。

- **没有模糊内容搜索或事件深链接**：内容后端使用字面 token／短语匹配，选择结果打开会话而非匹配的事件。
- **没有会话删除或取消归档控件**：会话可以归档，但已归档会话没有查看或取消归档界面，工作区注册删除也不会删除会话。
- **pending 交互不聚合进折叠分组**：折叠分组内的等待行不会点亮分组头部指示，只有展开该分组后才可见。
- **原生文件夹选择依赖本地 Host 载体**：在 `-native` 组合下，进程内或远程浏览器部署无法打开本地操作系统对话框；可远程使用的拾取是 `-browse` 组合的应用内流程。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。这是一个纯消费插件：向两个宿主声明的 slot 注册呈现组件及其 locale 词典——inject 接口是无状态的 RPC 包装加一次 create-and-open 调用；它不发出 Cordis 事件，也不持有跨插件可变状态。
