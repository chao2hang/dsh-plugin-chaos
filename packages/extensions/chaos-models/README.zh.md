---
description: "浏览器对话框：为 llm-pi-ai 提供的非官方模型设置上下文窗口、输出 token、图片输入与思考等级能力，供用户选择或排查逐模型覆盖。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-models

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-models` 在模型选择器菜单背后添加「模型能力设置」对话框：它读取当前会话的模型，并向该模型的 `llm-pi-ai` 设置条目写入最小能力补丁。你可以设置上下文窗口、默认最大输出 token、图片输入支持，以及可选择的思考等级；`llm-pi-ai` 校验该写入并在下一次模型解析时应用，无需重启。只有被修改的字段会写入。官方适配器及不属于 `llm-pi-ai` 的提供方会被拒绝并给出提示，而不是接受不支持的覆盖。该对话框只存在于浏览器；宿主入口只携带思考等级词表，没有运行时行为。

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

在输入框打开模型选择器菜单并选择其中的能力设置行；对话框加载当前会话的模型及其 pi-ai 设置条目。

### 何时选择

当非官方模型通过 `llm-pi-ai` 提供、而其条目错误描述了某项能力——上下文窗口不对、缺少思考等级，或端点实际接受图片输入——时选择本对话框。它只写入 `llm-pi-ai` 设置；提供方未在其中配置的模型会得到 `当前模型不是可配置的非官方模型。`，不接受任何写入。官方 DeepSeek 适配器自行拥有能力声明，不能通过本对话框编辑。

### 对话框配置什么

- **上下文窗口**——带单位精度的滑块，附 16K 到 2M 的常用档位；输入框接受 `128K` 或 `1M` 这类后缀。
- **最大输出 token**——带单位精度的滑块，附 1K 到 128K 的常用档位。
- **图片输入**——复选框，开启时写入 `input: ['text', 'image']`，关闭时写入 `input: ['text']`。
- **思考等级**——有序的 pi-ai 等级（`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`）；未选择任何等级——或只选 `off`——时写入 `reasoningEfforts: false`，`off` 与其他等级同选时使用 pi-ai 的无参数 `off` 值，其他被选等级保留其现有线值。

### 保存如何应用

保存路由 `models` 列表中已声明的模型会编辑该条目（写入以一条编辑后的行替换整个数组）；保存目录模型则写入 `modelOverrides.<model-id>` 条目。写入是对 `llm-pi-ai` 命名空间的一次设置路径变更，携带快照的 revision；只有被修改的字段离开对话框。`llm-pi-ai` 校验该 section 并在下一次模型解析时应用——适配器目录无需重启即重建。对话框的设置快照在每个客户端只预热一次，并在每次设置提交后失效，因此重新打开无需再次等待完整设置读取。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是围绕一个设置 seam 的两个半边：一个导出思考等级词表的空宿主入口，和一个渲染对话框并经设置 remote 写入的浏览器半边。

### 客户端接线

浏览器半边注册一个带键的 `conversation.input.right` 槽位（`chaos-model-capabilities`），自身不渲染任何内容：模型选择器的能力设置行派发 `dsh:open-model-capabilities` 窗口事件，对话框为可见会话打开。一个有界的进程内缓存持有一份设置 describe 快照——客户端启动时预热、各次打开间共享，并由 `settings/document-updated` remote 事件与对话框自身的保存失效。对话框经会话 remote 读取模型目录；写入路径是 `saveModelCapabilities`，一次 `set` 操作，其路径取决于模型是路由 `models` 条目还是覆盖，因为设置路径变更只遍历普通对象，无法原地索引 `models` 数组。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 宿主入口：思考等级词表与 `reasoningEffortsOf` 转换 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：槽位注册、设置缓存、remote 适配器 |
| [`src/client/ModelCapabilities.tsx`](src/client/ModelCapabilities.tsx) | 对话框组件、容量解析与吸附、设置写入 |
| [`tests/models.client.spec.ts`](tests/models.client.spec.ts) | 等级转换、容量解析与三种保存操作形态 |
| — | 不发布运行时不变式伴生入口；浏览器半边拥有一个带键槽位注册，其对话框状态在每次打开时从缓存的设置快照与模型目录派生。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [pi-ai LLM 适配器](../../llm/llm-pi-ai/README.zh.md)——拥有校验与 models / modelOverrides 形态的设置路由。
- [模型选择菜单](../../client/ui-model-selection/README.zh.md)——其能力设置行打开本对话框的菜单。
- [Chaos bundle](../chaos-bundle/README.zh.md)——把本插件声明为依赖的层。
- [web-app bundle](../../bundle/web-app/README.zh.md)——挂载本行的层。

-----

<a id="model-experience"></a>
## 模型体验

无，因为能力对话框在浏览器中渲染，其选择通过 pi-ai 设置路由持久化；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明对话框无法替你决定什么。它们是当前包约束，不是任务积压。

- **对话框无法探测提供方能力**——只填写端点确实支持的值；错误的上下文窗口或输出上限会按原样应用。
- **不在 pi-ai 设置路由中的模型无法配置**——对话框为其模型打开之前，该路由必须已经在 `llm-pi-ai` 中声明该提供方。
- **对话框文案是硬编码的简体中文**——不经由兄弟 Chaos 插件注册的 locale 词典。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
