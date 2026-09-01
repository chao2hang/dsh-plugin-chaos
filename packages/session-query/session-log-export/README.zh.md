# @deepseek-ai/dsh-session-log-export

[English](README.md) | 中文

Web Session 日志下载控制，使用本包 Host 半包自带的流式 ZIP 端点。Host 半包注册该路由；浏览器半包提供一个供当前 Session 侧边栏中的“下载日志”操作与斜杠命令共用的下载控制器和结果弹窗。ZIP 生成、原始 JSONL/zstd 读取、子 Session、附件、背压和 HTTP 错误语义仍由 [Host 流式路由](src/index.ts)负责。

## 命令约定

| 输入 | 结果 |
|---|---|
| `/export` | 记录一组用户命令生命周期；提交命令的浏览器收到本地执行确认后，下载 `GET /api/session.export?sessionId=<id>&includeDescendants=true`。 |
| `/export <path>` | 返回错误。浏览器下载通过浏览器的普通下载行为选择目标位置。 |

该命令只由 Web bundle 挂载。只有 `/export` 返回成功时，本地 `command/executed` 确认才会在提交命令的浏览器中触发斜杠下载；其他标签页仍会渲染持久命令行，但不会重复执行浏览器副作用。所选 Session 的侧边栏菜单操作直接调用同一个控制器。两种入口都会先发出 `HEAD` 预检，再把 GET URL 交给浏览器下载管理器，JavaScript 不会缓冲 ZIP；它们共用并发折叠、插件释放时取消预检、准备阶段错误处理、浏览器保存行为和同一个 Modal。

Host 下载端点会在 `readRaw` 前 flush 活动的根 Session，因此斜杠命令触发的 ZIP 会包含启动下载的 `command/run` 与 `command/done` 事件对。冷持久化 Session 不需要 flush。

弹窗报告准备中、开始下载或失败。关闭弹窗不会取消正在进行的下载；该操作随后完成时也不会重新打开弹窗。每个 Session 同时只允许一项下载，重复操作会共用该任务。

## 组合

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

Web bundle 将本包与 `dsh-host-webserver`、`dsh-commands`、`dsh-client-ui-commands` 和 `dsh-client-ui-conversation` 一起挂载。本包将 Session 范围的弹窗保留在 `conversation.session.header.utilities`；`dsh-client-ui-workspace` 提供所选 Session 侧边栏中的“下载日志”菜单操作。标题旁的 `conversation.session.header.actions` 和 Trajectory 都不包含导出入口。

## 模型体验

### 用户 `/export` 控制

#### 模型看到什么

无。`/export` 留在用户命令平面，ZIP 下载不会进入模型历史。

#### Token 影响

为零。该命令不创建模型轮次。

#### KV Cache 影响

无。仅日志命令生命周期和浏览器下载不会改变派生请求前缀。

## 已知限制与暂缓事项

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
