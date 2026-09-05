---
description: "dsh Web 输入框的模型选择：/model 命令弹层与输入框 Model/Effort 席位共用一份会话级目录（ctx.modelDirectories），经 session.selectModel 提交，带代次把关的加载、基于可路由性的输入框阻塞，以及在适配器、设置与凭据事件上的刷新。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-model-selection

[English](README.md) | 中文

## 概述

`dsh-client-ui-model-selection` 让用户为会话挑选提供方、模型与推理强度，两个入口共享同一份状态：`/model` 命令弹层与输入框的 Model/Effort 席位。两者都通过 Host 加载会话的建议目录，并经 `session.selectModel` 提交完整选择，因此在任一入口切换后，另一入口随即显示相同结果。输入框触发器打开两级菜单：模型页可按模型名称、模型 ID、提供方名称、提供方 ID 或描述筛选分组，所选确切模型提供由其适配器持有的推理强度名称、说明与默认值。选择在 Host 将其应用到下一次请求之前只是建议性的；当没有适配器服务该会话的路由时，本插件以自己的文案注册输入框阻塞块——恢复后无需重新加载即自动清除。组合一个由用户控制模型路由的会话时选择它。

## 目录

- [使用本包](#use-this-package)
- [输入框阻塞](#composer-blocking)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

两个入口都经 `ctx.modelDirectories.directoryFor(sessionId)` 解析各自会话的目录；没有任何模型界面被直接注册。`/model` popupSelect 贡献项经 `ctx.commandUi` 注册，而输入框的具名 `conversation.input.model` 席位由 ui-conversation 声明、由本包填充。

### 共享的会话级目录

Host 报告的 `ModelSelection` 是唯一的选择事实，但只有当确切的提供方／模型对仍在已公布分组中时才会回显；目录行缺席时，可路由的选择保持不变，触发器提示 `Select model`，系统不合成陈旧行，用户选择已公布模型前也不显示 Effort 行。目录加载与选择共享一个代次计数器，旧响应不会覆盖新结果；连接重置会丢弃所有常驻目录投影，并在显示前重新拉取 Host 恢复的选择。各提供方的元数据获取失败会内联列出，同时可用分组仍可选择；选择失败会保留先前的选择和目录。失败会进入各入口自己的重试面：菜单内带 Retry 的错误条服务于目录加载，被拒绝的选择则通过锚定在输入框卡片上的短时 Toast 公布。

### 推理强度选择与能力入口

`/model` 应用所选模型的默认推理强度，composer 随后可以选择任一已公布的推理强度。当组合中存在能力对话框（打开菜单时经其 `data-model-capabilities` 标记探测）时，根菜单增加一行能力入口，以会话 id 为详情派发 `dsh:open-model-capabilities` 事件；插件拥有的是触发器，而不是对话框。

### 在 Host 侧变化时刷新

每一份常驻目录都会直接在转发的 `llm/adapters-updated`、`settings/document-updated` 与 `credentials/reference-updated` owner 事件上重拉。提供方拓扑、提供方目录与默认选择因此都能收敛，Host 与 client runtime 无需再派生一个单独的模型变更别名。

-----

<a id="composer-blocking"></a>
## 输入框阻塞

当宿主报告没有适配器服务该会话的路由（`session.models.routable`）时，本插件经 `ctx.conversation.blocks` 注册一个 composer 阻塞块，输入框随之停用并显示本插件自己的文案；恢复后无需重新加载即自动清除。它只跟随 `routable`：`null`（首次加载之前，或加载失败之后）绝不阻断，否则一个慢的宿主就会锁死一个本来可用的 composer；目录成员关系同样不阻断，因为一条仍在服务、只是不再公布该模型的路由不在分组里，却完全可用。触发器自己的 `Select model` 回退仍然覆盖那种情形——那是显示，不是闸门。

目录按会话惰性解析（`ctx.modelDirectories.directoryFor(sessionId)`），随会话作用域一并 dispose（资源释放）。已寻址 subagent 会话不公开任一入口，其目录会拒绝加载、选择与重新连接刷新，因为绑定到 agent（智能体）的普通模型 RPC 会在直接 parent 继续执行路径之外激活持久化 child 历史。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明状态划分与接线；可观察的选择约定已在上文说明。

### 状态划分

`ModelDirectoryResolver`（`service.ts`）持有惰性的逐会话映射与一份被每个会话共享的 Host 生成代 `ModelCatalogDirectory`（`catalog.ts`）——每个生成代至多一次进行中的目录加载，refresh 时失效并重载，连接重置时清除并重载。每个 `ModelDirectory`（`directory.ts`）把共享目录与会话的持久化模型选择投影（`binding.session.projections.faceOf('modelSelection')`）结合，订阅两者并在任一变化时重新派生其 store 快照；`select()` 以逐目录的 generation 把关，旧响应无法胜出，`resetConnected()` 使来自上一 Host 生成代的进行中选择失效。composer 阻塞块是推送而非轮询：resolver 无法被 composer 读取（依赖只单向），因此阻塞块在 store 快照上发布，并随会话作用域收回。逐会话存储遵循 client service 模式（惰性的服务内部映射，条目由所属作用域的 disposer 删除），而不是宿主 ScopedLayers registry——后者从宿主载体机制派生作用域，并建模全局加遮蔽的具名注册表；这里是逐会话单例，没有需要合并的全局层。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/service.ts`](src/client/service.ts) | `ctx.modelDirectories` resolver 与 composer 阻塞块发布 |
| [`src/client/directory.ts`](src/client/directory.ts) | 逐会话共享目录 store 与 select/load 动作 |
| [`src/client/catalog.ts`](src/client/catalog.ts) | 一份 Host 生成代共享目录，代次把关的加载 |
| [`src/client/ModelSelect.tsx`](src/client/ModelSelect.tsx) | composer 席位：两级菜单、筛选、Effort 行、Toast |
| [`src/client/index.ts`](src/client/index.ts) | 两个注册（`/model` 弹层与 composer 席位） |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当选择约定不够用时阅读以下页面。

- [session-controller](../../api/session-controller/README.zh.md)——本包调用的 Host RPC：`selectModel` 与 `modelCatalog`。
- [ui-commands](../ui-commands/README.zh.md)——`/model` popupSelect 界面。
- [ui-conversation](../ui-conversation/README.zh.md)——本插件填充的 composer 席位。
- [Web 会话模型选择器](../../../.agents/notes/implemented/feature/2026-07-24-web-session-model-selector.zh.md)——双入口设计。
- [模型选择器筛选](../../../.agents/notes/implemented/feature/2026-08-23-model-selector-filter.zh.md)——模型页筛选决策。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 `session.selectModel`：两个入口都提交完整的 `ModelSelection`，Host 把它记录为持久化的 `model/selection` 会话事件，并在下一次提示词组装边界对其快照，因此后续请求采用所选提供方、模型与推理强度，而运行中的步骤保留已组装的请求；菜单交互不添加提示词内容。

#### KV Cache 影响

切换路由可能减少提供方侧后续请求的缓存复用，或使其失效；提示词前缀本身不受影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明两个入口无法选择或接受什么；它们是当前包约束。

- **无创建期或已寻址 subagent 选择**——两个入口都要求既有普通会话的 Agent；没有可纳入会话创建的草稿阶段模型选择，subagent 继续执行也有意不公开独立的模型选择约定。
- **目录名仅供呈现**——选择与持久化使用提供方／模型／推理强度 id；目录查询或确切模型元数据查询失败的提供方以不可选失败行列出，重新加载前保持原样。
- **不能任意输入推理强度**——composer 仅提供确切模型由适配器公布的推理强度；适配器没有推理元数据时不显示 Effort 行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。插件只注册一个 command contribution，HMR 测试覆盖释放；它不发出 Cordis 事件，也不持有跨插件可变状态。
