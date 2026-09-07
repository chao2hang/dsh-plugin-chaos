---
description: "将提供方输出的 think 标签在会话中呈现为折叠的推理展开项，供用户选择或排查 assistant think-tag 输出的呈现方式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-think-tags

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-think-tags` 把 assistant 消息中以 `<think>…</think>` 分隔符包裹的内容接入会话已有的默认折叠 Think 展开项，而不是把它们渲染为普通 assistant markdown。解析前会合并相邻 text block，因此流式响应可把任意一个标签拆到多个 chunk 中而不破坏区域。匹配区域内的内容成为 reasoning block；区域外的内容保持 assistant markdown，已有的 Think 行继续拥有折叠摘要、展开动作与流式状态。本插件不改变任何 session event、提供方请求或持久消息——解析发生在浏览器渲染时。

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

在渲染会话 UI 的组合中挂载本插件；该渲染器作用于每个被渲染的 assistant step。

### 何时选择

当提供方把其推理以字面 `<think>…</think>` 分隔符包裹在 text block 中输出、而你希望这些内容以推理而非可见的 assistant 文本呈现时选择本插件。推理已作为原生 reasoning block 到达的模型不需要它：这些 block 原样通过。移除该插件行后，分隔符重新作为普通 assistant 文本显示。

### 解析如何工作

该插件在解析前合并同一 assistant step 的相邻 text block，然后在每个 `<think>` 与 `</think>` 处切分文本。匹配区域内的文本成为 reasoning block；区域外的文本保持 assistant markdown。未闭合的起始 `<think>` 会把该 assistant step 的余下内容视为 reasoning，与提供方显然已开启的区域一致；原生 reasoning block 与非文本 block 原样通过。

### 什么保持不动

分隔符解析仅用于呈现。该插件不改变 session event、提供方请求、持久消息，或没有匹配起始标签的文本——日志保留提供方输出的原始 text block 与分隔符。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器半边拥有一切；宿主入口是一个空 `apply`，让 Loader 能挂载该行。

### 渲染器替换

客户端以 `priority: -1` 注册 `assistant-step` 的带键 `conversation.chat.node` 渲染器，遮蔽 ui-chat 安装的默认 assistant 渲染器；销毁插件后跨重挂载恢复默认。`normalizeThinkTags` 对该 step 的 block 做一次遍历：非文本 block 原样复制，相邻 text block 连续段先合并，再由双状态扫描按分隔符常量切分合并后的文本，并合并相邻同类跨度。reasoning block 经由原生 Think 行使用的共享 `DisclosureRow` 原语渲染。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 宿主入口：供 Loader 使用的空 `apply` |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：带键 `assistant-step` 渲染器注册 |
| [`src/client/think-tags.ts`](src/client/think-tags.ts) | `normalizeThinkTags`：block 合并与分隔符解析 |
| [`src/client/ThinkTagAssistantNodeView.tsx`](src/client/ThinkTagAssistantNodeView.tsx) | 替换渲染器，含 Think 展开行 |
| [`tests/think-tags.client.spec.ts`](tests/think-tags.client.spec.ts) | 分隔符解析、拆分标签、普通与原生 block 的直通 |
| [`tests/renderer-override.client.spec.ts`](tests/renderer-override.client.spec.ts) | 渲染器跨重挂载遮蔽并恢复默认 |
| — | 不发布运行时不变式伴生入口；插件拥有一个带键 UI 注册，其处置由 renderer-override spec 证明。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [聊天 UI](../../client/ui-chat/README.zh.md)——带键节点渲染器家族与本插件遮蔽的默认 assistant 渲染器。
- [会话 UI](../../client/ui-conversation/README.zh.md)——normalizer 消费的 assistant block。
- [Chaos bundle](../chaos-bundle/README.zh.md)——插入本行的层。
- [web-app bundle](../../bundle/web-app/README.zh.md)——Chaos 各层构建于其上的组合。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该插件只在浏览器中将 think 标签作为呈现内容渲染；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明呈现的边界在哪里。它们是当前包约束，不是任务积压。

- **分隔符解析仅用于呈现**——历史导出与提供方重试仍保留原始 text block 与分隔符；会话日志绝不被改写。
- **未闭合的 `<think>` 会把该 assistant step 的余下内容视为 reasoning**——解析器匹配提供方显然已开启的区域，而不是猜测推理在哪里结束。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
