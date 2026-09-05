---
description: "Chaos web profile 的服务自重启：/api/system 状态与重启路由，以及带确认流程的「系统」设置区块，供运维替换进程并恢复会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-restart

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-restart` 让运维从浏览器替换运行中的 web 服务器进程：web 服务器上的一对宿主路由，以及驱动它们的设置页「系统」区块。`GET /api/system/status` 报告启动方式能否派生后继进程；`POST /api/system/restart` 等待 process-control 服务销毁当前应用树并以相同命令行派生分离的后继进程，然后在进程结束前经仍然打开的连接回执。会话是持久的——重启付出的是进行中的回合，不是对话历史——确认步骤会在有会话运行时给出警告。宿主报告不支持重启时，区块给出说明而不是控件。

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

打开「设置 → 系统」并确认重启；区块在给出控件之前先报告宿主能力。

### 何时选择

当 web 服务器运行在能派生后继进程的启动方式下、而运维必须在无 shell 访问时替换进程——修改配置之后，或清理卡死状态——时选择本控件。它是需确认的运维动作，绝不是自动恢复：被中断的回合可能已经执行过带副作用的工具，而日志无法区分「工具已完成但结果未记录」和「工具从未运行」，因此是否重放该回合由操作者决定。宿主半区需要 web 服务器；process-control 服务是可选的，缺少它时路由仍会应答并报告不支持。

### 最小配置

```yaml
- id: chaos-restart
  name: '@deepseek-ai/dsh-plugin-chaos-restart'
  config:
    enabled: true
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | 挂载宿主路由；`false` 不注册路由，浏览器区块保持挂载并报告不支持 |

web-app bundle patch 以 `enabled: true` 挂载该行。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-plugin-chaos-restart)是每个受支持字段的穷尽式真源。

### 路由如何应答

- `GET /api/system/status` 应答 `{ canRestart }`，取自可选的 `processControl` 服务；无法派生后继进程的启动方式报告 `false`。
- `POST /api/system/restart` 等待 `processControl` 销毁当前应用树并以相同命令行派生分离的后继进程。替换无法开始时以 HTTP 503 返回 `{ ok: false, reason }`；返回 `{ ok: true }` 后，路由经已建立的连接应答，当前进程在事件循环排空后结束。非 `POST` 请求应答 405。

### 重启会失去什么，不会失去什么

会话保存在磁盘的会话日志里而非进程内存中，因此重启不会丢失对话历史。重启真正终止的是进行中的回合，它随进程一同消亡。这样的回合不会写下自己的 `turn/end`；持久化层在重新加载时以 `reason.kind === 'interrupted'` 将其关闭来修复，退出前记录的所有事件均完整保留。`chaos-retry` 插件会渲染这一关闭标记并提供一键重发；没有它，恢复依然正确，只是转录区没有对应的行。宿主接受后，区块进入等待状态——重连由连接层负责，页面会自行恢复。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是 web 服务器之上一个无状态的宿主半边，加上渲染区块并经 `fetch` 驱动相同路由的浏览器半边。

### 宿主半边

`apply` 在 `ctx.webServer` 上、同一个 effect 内注册两条 `exact` 路由：状态路由读取 `ctx.get('processControl')` 并应答其 `canRestart`（或 `false`），重启路由等待 `processControl.restart()`——拒绝或抛出成为 503 响应体。两条路由都是对该可选服务的直通，不持有状态。`enabled: false` 配置在任何注册之前返回。本包 tsconfig 恢复客户端基座刻意去除的 ambient `node` 类型，因为宿主半区提供 HTTP 路由。

### 浏览器半边

客户端入口注册 `chaos-restart` locale 命名空间与一个 `settings.section` 槽位（`chaos-system`，order 90）。`createRestartPort` 把两条路由封装到 `fetch` 之上：失败或畸形的状态应答按无能力处理，重启 ack 一旦 resolve 只表示已接受，绝不表示已经恢复。区块从作用域内的会话列表快照读取运行中的会话数；宿主报告不支持时渲染不支持提示而不是控件。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 宿主入口：`Config` schema、两条 web 服务器路由 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：设置区块槽位、locale 命名空间 |
| [`src/client/restart-port.ts`](src/client/restart-port.ts) | 两条路由之上的 `fetch` 端口，含失败翻译 |
| [`src/client/RestartSection.tsx`](src/client/RestartSection.tsx) | 「系统」区块：能力门控、确认与等待状态 |
| [`tests/restart-route.spec.ts`](tests/restart-route.spec.ts) | 针对挂载的模拟 web 服务器的路由语义 |
| [`tests/restart-port.client.spec.ts`](tests/restart-port.client.spec.ts) | 端口读取与失败翻译 |
| [`tests/restart-section.client.spec.tsx`](tests/restart-section.client.spec.tsx) | 区块渲染：门控、确认、运行中会话警告 |
| — | 不发布运行时不变式伴生入口；宿主路由无状态地直通 processControl 服务，区块状态每次渲染从该服务派生。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [Process control](../../boot/process-control/README.zh.md)——销毁当前应用树并派生后继进程的服务。
- [重试条](../chaos-retry/README.zh.md)——为重启所中断回合提供的恢复入口。
- [web-app bundle](../../bundle/web-app/README.zh.md)——挂载本行的层。
- [Host web server](../../host/webserver/README.zh.md)——路由注册 seam。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-plugin-chaos-restart)——受支持的配置字段及其 JSDoc。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包渲染设置区块与宿主重启路由；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明点击重启之后仍由操作者负责什么。它们是当前包约束，不是任务积压。

- **区块报告的是已接受，而非完成**——它无法观测独立的后继启动失败；启动器会先释放当前应用树及其 listener 再派生后继进程，因此固定端口不会造成此类失败。
- **`canRestart` 是启动方式的能力，不是权限**——该端点的保护来自启用远程访问时 auth 插件的请求守卫；在回环地址上它与其他本地路由一样可达。
- **确认框中的计数只覆盖当前浏览器已知的会话**——其他已连接客户端正在运行的回合不计入。
- **`enabled: false` 只禁用宿主路由**——浏览器区块保持挂载，随后报告该启动方式不支持。
- **注册缺少 HMR 安全 spec**——没有测试销毁插件 fiber 并观察两条路由与设置区块随之移除；测试策略要求的处置证明在本包是延期工作。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
