# `@deepseek-ai/dsh-process-control`

[English](README.md) | 中文

harness 进程的通用进程控制服务：一个把当前命令行交给分离式后继进程的重启能力。

## 服务

`ProcessControlService` 在 Cordis 上下文上注册 `processControl` 服务键。这是一个服务包：具体启动器提供实例，消费者（如 `@deepseek-ai/dsh-plugin-chaos-restart`）通过 `ctx.processControl` 读取。

- `canRestart` 仅当进程以命令行启动（`process.argv.length > 1`）且启动器提供了用于静默应用拆卸的 `appExit` 服务时报告 `true`。
- `restart()` 等待 `appExit(0)` 释放当前应用树——包括已持有的 listener，使固定端口无需竞态即可转移——然后用 `process.execPath` 和相同的 `process.argv.slice(1)` 派生一个分离的、unref 的后继进程，继承环境和 stdio。派生后解析 `{ ok: true }`；拆卸进行中的第二次调用解析 `{ ok: false, reason: 'restart already pending' }`；拆卸或派生失败解析 `{ ok: false, reason }` 且不会派生。

## 模型体验

### 重启能力面

#### 模型可见内容

无。该服务在 `ctx.processControl` 上暴露 `canRestart` 与 `restart()` 供宿主侧进程替换使用；它不注册提示词区块、工具 schema 或 session event。

#### Token 影响

零：能力标志与后继派生都是进程生命周期层面的事，不贡献请求 token。

#### KV Cache 影响

无影响。本包既不组装也不发送 provider request，因此不会改变请求 token 或 KV Cache 复用。

## 已知限制与延后工作

- **拆卸归启动器负责** — `restart()` 等待 `appExit` 服务，自身不释放 listener 也不停止进程；启动器的拆卸必须在后继绑定固定端口前处置应用树（包括已持有的 listener）。
- **后继的启动不可观测** — 服务派生分离的、unref 的后继进程后立即返回；它无法报告独立的后继启动失败，当前进程也不会等待后继。
- **启动命令就是 Node 命令行** — 后继以 `process.execPath` 加 `process.argv.slice(1)` 与继承的环境运行；不是普通 Node 命令行的启动器（例如 Electron）需要不同机制。
- **拆卸期间的第二次请求被拒绝** — 当 `appExit` 尚未落定时，后续 `restart()` 调用解析 `{ ok: false, reason: 'restart already pending' }`；拆卸失败后该标志复位，可以重试。

**运行时不变式：** 不发布伴生入口。除进程生命周期持有的 pending 标记外，该服务无状态。
