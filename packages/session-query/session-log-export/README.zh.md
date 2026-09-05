---
description: "面向用户与维护者的 Web Session 日志导出说明，用于把会话的持久日志下载为流式 ZIP：/export 命令、侧边栏下载操作、共享弹窗，以及归档子会话与附件的宿主路由。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-log-export

[English](README.md) | 中文

## 概述

`dsh-session-log-export` 在浏览器中把 Session 的持久日志下载为 ZIP 归档。在 Web 输入框输入 `/export`，或在所选 Session 的侧边栏选择**下载日志**：浏览器半包先发出 `HEAD` 预检，再把 GET URL 交给浏览器下载管理器；Host 半包则以流式传输该 ZIP——根会话的原样产物、每个子 agent 后代，以及每张被引用的图片——JavaScript 不会缓冲整个归档。该命令只记录用户命令生命周期，不创建模型轮次。一个共享弹窗报告准备中、开始下载或失败；每个 Session 同时只允许一项活动下载。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当用户需要把 Session 的持久日志作为一份归档带走时，在 Web 组合中挂载本包。常用路径是显式的：把本包与 Web bundle 的命令和会话包一起挂载，然后输入 `/export` 或使用侧边栏操作。

### 何时选择

当需要在浏览器侧导出包含子会话与附件的持久会话日志时选择它。当需要 Host 路径写入器时避免使用——目标位置由浏览器的普通下载行为决定，不会返回 Host 路径或原生文件夹操作。

### 最小配置

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `compressionLevel` | `6` | 每个 ZIP 条目的 DEFLATE 级别 `0`–`9` |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-log-export)是每个受支持字段及其 JSDoc 的穷尽式真源。

### 命令约定

| 输入 | 结果 |
|---|---|
| `/export` | 记录一组用户命令生命周期；提交命令的浏览器收到本地执行确认后，下载 `GET /api/session.export?sessionId=<id>&includeDescendants=true`。 |
| `/export <path>` | 返回错误。浏览器下载通过浏览器的普通下载行为选择目标位置。 |

该命令只由 Web bundle 挂载。只有 `/export` 返回成功时，本地 `command/executed` 确认才会在提交命令的浏览器中触发斜杠下载；其他标签页仍会渲染持久命令行，但不会重复执行浏览器副作用。所选 Session 的侧边栏菜单操作直接调用同一个控制器。两种入口都会先发出 `HEAD` 预检，再把 GET URL 交给浏览器下载管理器，JavaScript 不会缓冲 ZIP；它们共用并发折叠、插件释放时取消预检、准备阶段错误处理、浏览器保存行为和同一个 Modal。

### 下载行为

Host 下载端点会在 `readRaw` 前 flush 活动的根 Session，因此斜杠命令触发的 ZIP 会包含启动下载的 `command/run` 与 `command/done` 事件对。冷持久化 Session 不需要 flush。弹窗报告准备中、开始下载或失败。关闭弹窗不会取消正在进行的下载；该操作随后完成时也不会重新打开弹窗。每个 Session 同时只允许一项下载，重复操作会共用该任务。

### 组合

Host 半包（`inject: ['commands', 'connection']`）注册 `/export` 命令与 `/api/session.export` 路由；浏览器半包提供 `ctx.sessionLogDownload`，并把 Session 范围的弹窗保留在 `conversation.session.header.utilities`。`dsh-client-ui-workspace` 提供所选 Session 侧边栏中的**下载日志**菜单操作。标题旁的 `conversation.session.header.actions` 和 Trajectory 都不包含导出入口。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明归档布局、流式传输边界与路由的错误语义；可观察约定已在[使用本包](#use-this-package)中说明。

### 归档内容

ZIP 的文件是会话已存储产物文本的原样内容，加上每个被引用的媒体对象：根产物保存在其原始基础名下（`session.jsonl`），每个子 agent 后代保存在 `subagents/<id>/<filename>` 下，每张被任一已包含日志引用的图片保存在 `media/<attachmentId>.<ext>` 下（按内容寻址，因此一份归档绝不会重复共享图片）。不写入 manifest——每个文件都与后端的持久产物或附件存储字节一致，并通过自身的首行或媒体类型自描述。读取失败的后代会使流报错，而不是交付被截断的归档。

### 流式传输与内存边界

压缩在宿主侧通过 fflate 的流式 Zip API 执行，归档字节增量产生，宿主从不在单个缓冲区中持有整个归档；当响应队列达到固定的 64 KiB 高水位线（外加一次同步 fflate push）时，生产会等待消费方拉取。请求中止与响应消费方取消共享同一个生产者信号，并终止活动压缩器。

### 路由错误语义

路由对缺失或非法的 `sessionId` 查询参数答以 `400`；`sessionQuery`、`sessionPersistence` 或 `attachments` 服务缺席时答以 `500`；持久化后端不公开逐会话原始产物（`supportsRawArtifacts`）时答以 `501`；无已存储产物的会话答以 `404`；准备已存储产物失败时答以 `500`。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 入口：`/export` 命令注册与 `/api/session.export` 路由 |
| [`src/archive.ts`](src/archive.ts) | 归档组装：flush 屏障、条目顺序、媒体收集、带容量门的流式 ZIP |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：下载控制器提供、`command/executed` 监听、弹窗 slot |
| [`src/client/controller.ts`](src/client/controller.ts) | 每 Session 一项进行中的浏览器下载；HEAD 预检与弹窗状态 |
| [`src/client/Dialog.tsx`](src/client/Dialog.tsx) | 共享的 Session 范围结果弹窗 |
| [`src/client/HeaderAction.tsx`](src/client/HeaderAction.tsx) | 渲染弹窗的 header-utilities slot 贡献项 |
| [`src/client/locales.ts`](src/client/locales.ts) | 弹窗的浏览器字典 |

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 用户 `/export` 控制

#### 模型看到什么

无面向模型的内容。`/export` 留在用户命令平面：commands 服务把它的 `command/run`/`command/done` 生命周期对记录为无模型轮次的 log-only session event，路由流式传输的 ZIP 只发往浏览器，不进入会话日志、模型历史或任何请求。

#### Token 影响

为零。该命令不创建模型轮次；log-only 生命周期对与浏览器下载都不贡献请求 token。

#### KV Cache 影响

无。仅日志命令生命周期和浏览器下载不会改变派生请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明本包何时不合适，或何时需要特别的运维注意。它们是当前包约束，不是任务积压。

- **要求逐 Session 原始产物**——下载端点读取随产品交付的 JSONL provider 所提供的明文或 zstd 产物；没有原始产物的仓库外 provider 无法服务该 route。
- **浏览器下载，而非 Host 路径写入**——目标位置由浏览器选择；不会返回 Host 路径或原生文件夹操作。
- **预检只报告流式传输前的失败**——浏览器接受 GET 后发生的子会话或附件读取失败由浏览器下载管理器报告，不通过弹窗报告。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：开放设计问题与尚未决定的探索方向。它明确不具权威性——已交付的行为、限制与既定理由以上文、包代码和相关页面为准。

#### 未来：浏览器之外的导出目标

下载刻意限定在浏览器范围；Host 路径或原生文件夹导出需要新的端点约定，并决定 ZIP 的落盘位置。

</details>

**运行时不变式：** 不发布伴生入口。Connection 与 command registry 持有两个注册，每次 export 直接读取权威 Session service。
