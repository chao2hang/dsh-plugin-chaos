---
description: "非正常结束对话的一键重发：重发最后一条用户消息，并补上崩溃恢复留下的 turn-interrupted 转录行，供用户恢复失败、触顶或被中断的回合。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-retry

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-retry` 在对话最近一个回合非正常结束时，于输入框上方显示一条停靠提示，提供对话最后一条用户消息的一键重发。四种结束会触发：回合以错误终止、助手前缀被中断、单次请求输出 token 上限提示，以及进程死亡留下的崩溃恢复关闭。本插件还补上缺失的 `turn-interrupted` 聊天节点，使在首个 token 之前就被杀死的回合仍投影为一条转录行而不是什么都不剩。点击「重试」会把最后一条用户消息写入输入框草稿，并通过公共输入动作提交——与发送按钮相同的路径。本包只存在于浏览器；宿主入口的存在只是让 Loader 能挂载该行。

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

回合失败后留意输入框上方的提示条；它标注结束状态并提供「重试」。

### 何时选择

当对话失败应能从转录区恢复时选择本插件：它与 `chaos-restart` 配合——后者的「系统」区块执行重启，而本插件负责在重启后提供恢复入口。回合仍在运行或流式输出中、队列中还有待发消息或有待处理的交互决策、失败之后对话已有新进展（新的用户消息或已完成的助手回复）时，提示条绝不出现；已移除的会话也绝不显示它。

### 什么触发提示条

结束状态从 Chat 目标的最后一个可见行读取（末尾的回合 footer 会被越过）。四种结束会触发：

- 回合以错误终止——提示条同时展示失败信息；
- 回合被中断——助手前缀被冻结；
- 单次请求输出 token 上限提示；
- 崩溃恢复关闭——回合随进程一同消亡。

### 「重试」做什么

点击「重试」会把最后一条用户消息的文本写入输入框草稿，并通过公共输入动作提交，命令裁决、序列化与通知仍由输入状态机负责。重发是在同一会话中追加一条新的用户消息；它不截断失败的回合。

### 崩溃恢复行

进程死亡的回合——服务重启、崩溃——不会写下自己的 `turn/end`；持久化层在重新加载时以 `reason.kind === 'interrupted'` 将其关闭。自带节点体系为其他每一种终止原因都提供了 Definition，唯独没有这一种，而它的「中断助手」兜底路径要求已流式产出内容作为证据，于是在首个 token 到达前、或在工具调用与其结果之间被杀死的回合，根本不会投影出任何东西。本包补上缺失的 `turn-interrupted` 节点 Definition 及其转录行，使该结束无论回合进行到哪一步都可见——也让提示条在重启后有可检测的对象。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器半边做出两项贡献——一个聊天节点 Definition 及其带键渲染器，和一个 dock 条目——且不拥有任何 store。

### 设计理念

异常结束状态是对拆分快照的纯推导：`detectAbnormalEnd` 读取 Session 生命周期、Chat 目标与生效的待处理交互，仅当会话空闲且最后一个可见 Chat 节点是终止失败、崩溃恢复关闭、中断的助手前缀或输出 token 上限提示时给出答案。`lastUserTextOf` 从后向前遍历已定稿的对话节点，取最后一条用户消息的可见文本。`turn-interrupted` Definition 只匹配持久化层写入的 `turn/end { reason.kind === 'interrupted' }` 标记，因此普通中止与提供方失败保留各自的行。文案位于 `chaos-retry` locale 命名空间。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 宿主入口：空 `apply`，让 Loader 能挂载该行 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：节点注册、dock 条目、locale 命名空间 |
| [`src/client/retry-model.ts`](src/client/retry-model.ts) | 纯推导：异常结束检测、最后用户文本收集 |
| [`src/client/turn-interrupted.ts`](src/client/turn-interrupted.ts) | `turn-interrupted` 节点 Definition 及其状态 |
| [`src/client/RetryDock.tsx`](src/client/RetryDock.tsx) | 停靠提示条与经输入动作的重发 |
| [`src/client/TurnInterruptedNodeView.tsx`](src/client/TurnInterruptedNodeView.tsx) | 崩溃恢复转录行 |
| [`tests/retry-model.client.spec.ts`](tests/retry-model.client.spec.ts) | 哪些结尾触发提示条、哪些用户文本可重发 |
| [`tests/retry-dock.client.spec.tsx`](tests/retry-dock.client.spec.tsx) | 提示条渲染与先 setDraft 后 submit 的有序重发 |
| [`tests/turn-interrupted.client.spec.ts`](tests/turn-interrupted.client.spec.ts) | Definition 只匹配被中断的关闭 |
| — | 不发布运行时不变式伴生入口；插件不持有任何 store——异常结束状态每次渲染从会话快照派生。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [服务自重启](../chaos-restart/README.zh.md)——本插件负责恢复其重启的「系统」区块。
- [会话 UI](../../client/ui-conversation/README.zh.md)——崩溃恢复行注册进入的节点 Definition 注册表。
- [聊天 UI](../../client/ui-chat/README.zh.md)——推导读取的 Chat 目标与带键节点渲染器家族。
- [web-app bundle](../../bundle/web-app/README.zh.md)——挂载本行的层。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该插件通过常规输入框路径重发最后一条用户消息；重发文本作为普通用户文本到达模型，插件不贡献固定提示区块。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明重试恢复什么、不恢复什么。它们是当前包约束，不是任务积压。

- **重试只重发文本**——最后一条用户消息包含图片或没有文本时提示条不出现，因为这里的草稿写入路径只支持文本。
- **点击「重试」会替换输入框草稿**——当前草稿中的内容会被重发文本覆盖。
- **重发不回滚失败的回合**——它在残缺历史之上追加新回合，而不是截断它。
- **注册缺少 HMR 安全 spec**——没有测试销毁插件 fiber 并观察节点 Definition、keyed 渲染器与 dock 条目随之移除；测试策略要求的处置证明在本包是延期工作。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
