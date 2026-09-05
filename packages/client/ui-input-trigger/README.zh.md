---
description: "dsh Web 输入框的触发流水线：光标处 '/' 与 '@' 检测、带钻取面包屑的分组候选菜单、键盘裁决，以及经 ctx.inputTriggers 把 pick 路由到已注册 source。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-input-trigger

[English](README.md) | 中文

## 概述

`dsh-client-ui-input-trigger` 为 Web 输入框提供 `/` 与 `@` 触发流水线：用户输入时，它检测光标处仍处于活动状态的触发 token，在输入框上方打开分组候选菜单，并把每次 pick——指针、Tab、回车或空格——路由到注册该菜单的 source。功能插件经 `ctx.inputTriggers` 注册一个 source，即可获得候选拉取、菜单状态、键盘裁决与程序化启动，而无需自建任何机制；对话接线层通过 `track`／`arbitrate`／`onSpace`／`adjudicate` 驱动逐会话的 controller。pick 产出 `CommandClaim` 或 `ReferenceInsert` 数据，其模型可见后果由消费这些数据的宿主包与输入状态机包负责，而非本插件。在基于 ui-conversation 构建的输入框上添加斜杠命令或 `@` 引用 source 时选择它。

## 目录

- [使用本包](#use-this-package)
- [候选菜单](#the-candidate-menu)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

经 `ctx.inputTriggers.registerSource(src)` 注册一个 source；对话接线层经 `sessionOf` 解析逐会话的 controller 并驱动它。controller 还提供 `toggleSource` 供拥有程序化入口的宿主使用；移动端输入框只保留键入 `/` 的命令入口，而不设工具栏入口。

### 注册 source

一个 `InputTriggerSource` 绑定到 `'/'` 或 `'@'`、命名一个菜单分组（重复的 trigger／name 组合会抛错），并声明显示 `order` 与 `showGroupTitle`。流水线在每次命中时以实时查询、在下一次查询或菜单关闭时被取代的 `AbortSignal`、以及 `ClientSessionContext` 投影调用 `candidates(session, req)`——会话始终由 agent（智能体）支撑，因此投影只含会话身份。每次 pick 都落入 `onPick`；在其可触达的每个会话 controller 中被预热的 source 实现 `warm`，`lexicon` 名录在预热后仍会变化的 source 实现 `subscribeLexicon(session, listener)`，controller 每收到通知就重拉并重新发布聚合结果。产出插入结果的 source 需携带 `ReferenceCodec`：剪贴板投影服务于复制／剪切／持久化，而 `serializeReference` 在提交时按出现次数路由模型序列化；owner 缺席或缺少 codec 会拒绝，而不是静默降级为剪贴板文本。

### 检测与守卫层级

`detectTrigger` 从光标向左扫描并应用词边界规则：触发字符只在草稿开头、空白字符（含换行）之后或标点之后开启，绝不在词字符之后。两处 URL 豁免让 `/` 在 URL 内保持无效——scheme 分隔 `:` 之后的 `/`，以及 `//` 的第二个斜杠。`@` 优先使用共享的文件引用语法，包括可跨越空白的未闭合引号 token。守卫层级由输入阶段派生：`plain` 两个字符都活动，`claimed` 抑制 `/` 而 `@` 保持活动，`frozen` 两者都抑制。

### 空格与回车裁决

流水线与命令无关：空格与回车裁决按注册序轮询可选的 `matchSpace`／`matchEnter` 钩子，第一个非 undefined 的应答胜出。空格在击键间触发，必须基于热状态对刚完成的引导 token 同步作答；回车可以强等待 source 自身的预热，并自行解析完整修剪后的草稿。回车裁决还携带 `SubmitEnvelope`——输入框的图片附件数量——使 source 能拒绝它无法整体消费的提交；命令接受输入框图片时，`CommandClaim` 声明 `images: true`，其 `submit` 随之以第三个参数收到序列化后的图片载荷。

-----

<a id="the-candidate-menu"></a>
## 候选菜单

MenuView 把菜单 store 渲染进 `conversation.input.overlay` slot（列表类，会话 scope），菜单关闭期间渲染 null。键入式触发会 seed 为该触发注册的所有 source；程序化 launcher 只 seed 所请求的 source，并在菜单关闭或重新开始键入式 tracking 前，通过 controller 的 `launcher` 快照 store 发布该 source 名称。分组按可选的 `InputTriggerSource.order` 排序（越小越靠前，默认 0，同值保持注册序），组标题行经 `slash.menu` locale 命名空间本地化；未知 source 显示其原名。`showGroupTitle: false` 会在 pending 与 ready 状态全程隐藏该行，ready 且候选项声明了 `section` 的组则以这些 section 标题行取代 source 标题。

钻取在原位精炼查询而不是解析候选：Tab 或行上的箭头向下进入，面包屑（`header` 与 crumb pick）向后导航，`drilled` 标志在菜单关闭前跨后续输入保留。新查询的应答 pending 期间，先前的候选项与高亮保持渲染（stale-while-revalidate），只有本身无候选项的 pending 分组显示骨架屏；结算以 generation 把关，旧响应不会覆盖新结果，每次新查询中止前一个请求，失败的 source 静默丢弃其分组并留一条 console 记录。列表高度收敛到输入框上方的空间，指针落在菜单与所在输入框卡片之外即关闭菜单。combobox 模式：焦点始终留在 textarea，行在 mousedown 时完成 pick，高亮由 `aria-activedescendant` 承载，IME 组合中的按键全部透传。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明分层与 pick 路径；可观察约定已在上文说明。

### 分层

`src/core/` 是纯内核——`detectTrigger`、`menuReduce`／`seedGroups`／`MENU_CLOSED`、`exactMatch`——零 React／DOM／cordis。`src/client/service.ts` 是根侧一半：无状态 source 注册表加逐会话 controller 映射，注册序即菜单分组序与匹配钩子轮询序。`src/client/controller.ts` 持有全部可变交互状态——权威 hit（含 span；它比菜单关闭存活更久以供空格裁决）、menu、`launcher`、`headers` 与 `lexicon` 快照 store，以及候选拉取生命周期——并通过分派作用域内的输入变更事件（`slash/input-begin-command`、`slash/input-insert-text`、`slash/input-insert-reference`）执行 pick 结果。`src/types.ts` 与两个 `contract.ts` 文件是冻结的跨包约定；变更需经主线程仲裁。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/core/detect.ts`](src/core/detect.ts) | 光标触发检测与词边界规则 |
| [`src/core/menu.ts`](src/core/menu.ts) | 纯菜单 reducer、分组 seed、精确匹配查找 |
| [`src/client/service.ts`](src/client/service.ts) | 根 source 注册表与逐会话 controller 解析 |
| [`src/client/controller.ts`](src/client/controller.ts) | 逐会话 hit、menu、headers、lexicon、拉取与 pick 执行 |
| [`src/client/MenuView.tsx`](src/client/MenuView.tsx) | 注册进 `conversation.input.overlay` 的浮层菜单组件 |
| [`src/client/locales.ts`](src/client/locales.ts) | `slash.menu` 字典 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [输入状态机与斜杠流水线](../../../.agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.zh.md)——驱动本 controller 的输入框接线。
- [ui-conversation](../ui-conversation/README.zh.md)——拥有输入浮层 slot 与输入状态机的输入框。
- [file-reference](../../context/file-reference/README.zh.md)——检测所消费的共享 `@file` 语法。
- [ui-primitives](../ui-primitives/README.zh.md)——菜单渲染所用的 `useAnchoredMaxHeight` 与引用图标。

-----

<a id="model-experience"></a>
## 模型体验

无，因为触发流水线只是浏览器呈现——pick 产出 `CommandClaim`／`ReferenceInsert` 数据，其模型可见后果（宿主命令执行；插入的引用文本随普通提示词发送）由负责消费这些数据的宿主包与输入状态机包负责。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明 source 作者今天无法注册或呈现什么；它们是当前包约束，不是任务积压。

- **只有全局 source 名录**——source 在根服务上注册并触达每个仍存续的会话 controller；没有逐会话注册或遮蔽机制，因此会话级 source 需求目前无法满足。
- **失败的 source 从打开的菜单中静默消失**——候选、header 与 lexicon 失败只记录 console 并移除该分组（或跳过该次聚合），没有错误行；source 必须通过自己的候选项或所属功能呈现失败。
- **菜单文案键是开放集合**——组标题按 source 名称在 `slash.menu` 字典中查找，未注册的键按原文渲染；以新名称发布的 source 需要一条字典项才能本地化其标题。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。trigger pipeline 是浏览器侧纯内核（detect/reduce/match）加一个 registry，HMR 测试覆盖释放；它不发出 Cordis 事件，也不持有跨插件可变状态。
