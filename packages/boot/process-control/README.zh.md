---
description: "面向插件作者与启动器维护者的 harness 进程控制服务说明，用于选择或排查进程替换：canRestart 上报，以及在启动器自有拆卸后以相同命令行派生分离式后继进程。"
kind: "package-reference"
---

# @deepseek-ai/dsh-process-control

[English](README.md) | 中文

## 概述

`dsh-process-control` 告知插件当前进程能否替换自身，并在被要求时执行替换。消费方读取 `canRestart` 以决定是否提供重启入口，再调用 `restart()` 释放运行中的应用树，并以相同的 Node 命令行派生一个分离的后继进程，继承环境与 stdio。在派生前先释放已持有的 listener，使固定监听端口无需竞态即可转移。该服务是通用扩展点——启动器通过 `appExit` 提供拆卸回调，消费方使用 `ctx.processControl`，插件本身无任何配置。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当插件需要替换运行中的进程时消费 `ctx.processControl`——Web profile 的自重启路由是其随产品交付的消费方。常用路径是显式的：启动器提供 `appExit`，组合把本服务作为普通行挂载，消费方在提供该入口前先读取 `canRestart`。

### 何时选择

当组合需要在拥有静默拆卸回调的启动器背后进行进程替换时选择本服务。当进程不是普通 Node 命令行时避免使用——后继会重放 `process.execPath` 与 `process.argv`，因此 Electron 这类启动器需要别的机制。

### 服务面

- `canRestart` 仅当进程以命令行启动（`process.argv.length > 1`）且启动器提供了用于静默应用拆卸的 `appExit` 服务时才报告 `true`。
- `restart()` 等待 `appExit(0)` 释放当前应用树——包括已持有的 listener，使固定端口无需竞态即可转移——然后用 `process.execPath` 和相同的 `process.argv.slice(1)` 派生一个分离的、unref 的后继进程，继承环境和 stdio。派生后解析 `{ ok: true }`；拆卸进行中的第二次调用解析 `{ ok: false, reason: 'restart already pending' }`；拆卸或派生失败解析 `{ ok: false, reason }` 且不会派生。

### 挂载

本插件无配置地挂载——组合中的普通一行，与 Web profile 的 patch 一致。它没有 Config 接口，也没有 `config` 块；在启动器提供 `appExit` 之前，`canRestart` 一直为 `false`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明交接顺序与测试接缝；可观察约定已在[使用本包](#use-this-package)中说明。

### 设计理念

该服务是带单个 pending 标志的一个 Cordis `Service`。`restart()` 刻意固定两步顺序——先启动器自有的拆卸，后派生——使后继不会绑定垂死树仍持有的 listener。拆卸归启动器所有，因为只有启动器知道如何处置整个应用；本服务只负责等待。后继通过导出的 `internals.spawn` 接缝以分离并 unref 的方式派生，测试因此可以替换派生操作而不触碰 `node:child_process`。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务入口：`IProcessControl` 接口、`RestartResult`、`ProcessControlService`、`internals` 测试接缝 |

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 重启能力

#### 模型看到什么

本包不向模型提供任何内容：`ctx.processControl` 是宿主侧能力，不注册提示词区块、工具 schema 或 session event。重启是进程替换，不是模型轮次——`restart()` 等待启动器对整个应用树的拆卸，然后派生一个运行相同命令行的后继。会话历史只能经由 session-persistence seam 的持久日志到达后继；本包不会把内存中的会话状态带过替换，进行中的轮次随被拆卸的应用树一起结束。

#### Token 影响

为零。`canRestart` 与后继派生都是进程生命周期操作，不贡献请求 token；后继进程从恢复的持久历史自行组装请求。

#### KV Cache 影响

对任何实时请求都无影响。本包既不组装也不发送 provider request，因此不会改变请求 token 或 KV Cache 复用；重启后的进程自身不带任何提供方缓存，其复用取决于后继重建的历史是否匹配其请求前缀——这归持久化 seam 与 loop 所有。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本服务何时无法交付静默替换。它们是当前包约束，不是任务积压。

- **拆卸归启动器负责**——`restart()` 等待 `appExit` 服务，自身不释放 listener 也不停止进程；启动器的拆卸必须在后继绑定固定端口前处置应用树（包括已持有的 listener）。
- **后继的启动不可观测**——服务派生分离的、unref 的后继进程后立即返回；它无法报告独立的后继启动失败，当前进程也不会等待后继。
- **启动命令就是 Node 命令行**——后继以 `process.execPath` 加 `process.argv.slice(1)` 与继承的环境运行；不是普通 Node 命令行的启动器（例如 Electron）需要不同机制。
- **拆卸期间的第二次请求被拒绝**——当 `appExit` 尚未落定时，后续 `restart()` 调用解析 `{ ok: false, reason: 'restart already pending' }`；拆卸失败后该标志复位，可以重试。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。除进程生命周期持有的 pending 标记外，该服务无状态。
