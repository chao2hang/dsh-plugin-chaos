---
description: "DeepSeek Harness web 服务器的远程访问 token 认证：请求与 WebSocket 升级守卫、独立登录页，以及带滑动空闲超时与绝对生命周期上限的插件实例级浏览器会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-auth

[English](README.md) | 中文

## 概述

用一条登录 token 保护远程绑定的 Harness web 服务器：未认证浏览器对页面请求收到独立登录页、对 API 请求收到 JSON `401`，登录成功后获得 cookie 支撑的浏览器会话。会话驻留进程内存，带默认 7 天的滑动空闲超时（每次已认证请求刷新）与默认 30 天的绝对生命周期上限。回环部署保持匿名——仅当 web 服务器绑定 `0.0.0.0` 或配置了 `publicUrl` 时插件才激活。登录 token 经 credentials 系统解析，其值从不出现在配置中。

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

当组合面向远程客户端时，把本插件与 web 服务器一同挂载；只有绑定 `0.0.0.0` 或配置了 `publicUrl` 时它才自行激活。

### 何时选择

当 Web profile 绑定非回环接口或位于反向代理之后时选择本插件。Web bundle 默认挂载它；不满足任一激活条件的回环 HTTP 保持完全匿名且不受守卫保护。

### 最小配置

```yaml
- id: chaos-auth
  name: '@deepseek-ai/dsh-plugin-chaos-auth'
  config:
    idleTimeoutMs: 604800000
    absoluteTimeoutMs: 2592000000
    tokenRef: DSH_AUTH_TOKEN
    publicUrl: ''
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `idleTimeoutMs` | `604800000`（7 天） | 滑动空闲超时，每次已认证请求刷新 |
| `absoluteTimeoutMs` | `2592000000`（30 天） | 绝对会话生命周期上限；必须 >= `idleTimeoutMs`，激活时校验 |
| `tokenRef` | `DSH_AUTH_TOKEN` | 启动时解析为登录 token 的 credentials 引用 |
| `publicUrl` | `''` | 反向代理公网 URL；`https://` 前缀启用 `Secure` cookie 标志，任何非空值还会在回环上激活守卫 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-plugin-chaos-auth)是每个受支持字段的穷尽式真源。

### 激活与 token

本插件要求 `dsh-host-webserver` 的当前构建导出 `registerGuard` 与 `registerUpgradeGuard`，在旧版宿主上激活时抛出异常。登录 token 在启动时经 credentials 系统从 `tokenRef` 解析；当该引用未解析出非空值时，插件记录警告且每次 `POST /auth/login` 都应答 `401`，因此未配置的 token 会禁用登录而不会打开服务器。

### 守卫与路由

两个守卫在路由匹配之前运行。请求守卫放行公开路径（`/auth/login`、`/auth/logout`、`/manifest.webmanifest`，以及带 `token` 查询的 `/`），用会话 cookie 对照存储校验，对未认证页面请求应答登录页、对 API 请求应答 JSON `401`，并在每次已认证请求时刷新会话活动。升级守卫对 WebSocket 升级应用相同的会话校验，失败时以 `401` 响应销毁 socket。`GET /auth/login` 提供独立登录页；`POST /auth/login` 用恒定时间比较核对提交的 token 与解析值，创建会话并重定向到连接层的已认证 URL；`GET /auth/logout` 与 `POST /auth/logout` 销毁会话、清除 cookie 并重定向到登录页。

### 浏览器会话

会话按插件实例驻留内存：`dsh-session` cookie 内是 256 位随机 ID（`HttpOnly`、`SameSite=Strict`，HTTPS 下追加 `Secure`），每次已认证请求刷新的滑动空闲超时，构造时校验的绝对生命周期上限，以及惰性加每 10 分钟一次的周期性清理。cookie 的 `Max-Age` 取两个剩余窗口中较小者，因此 cookie 绝不会声明服务器不会兑现的生命周期。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本插件是建立在两个注入服务之上的函数插件：`webServer` 提供守卫与路由注册 seam，`connection` 提供已认证的重定向 URL。全部状态都在激活时创建的一个 `SessionStore` 实例中；守卫、登录与登出路由以及清理间隔都通过 `ctx.effect` 注册并随插件 fiber 撤销。登录页是不含应用代码的独立静态 HTML，由插件自身提供。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `Config` schema、激活围栏、守卫、登录与登出路由、登录页 |
| [`src/session-store.ts`](src/session-store.ts) | 内存会话存储、超时、cookie 构建与清除 |
| — | 不发布运行时不变式伴生入口；会话存储是插件实例级的，没有跨插件状态，守卫注册通过 ctx.effect 事务化完成。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [Web 服务器](../../host/webserver/README.zh.md)——受守卫保护的 HTTP 载体及其 `registerGuard` seam。
- [Credentials](../../credentials/credentials/README.zh.md)——把 `tokenRef` 解析为登录 token 的系统。
- [Web app bundle](../../bundle/web-app/README.zh.md)——挂载本插件的组合。
- [Connection](../../client/connection/README.zh.md)——登录重定向目标为其已认证 URL 的浏览器传输层。

-----

<a id="model-experience"></a>
## 模型体验

### 受守卫的 Web 服务器表面

#### 模型看到什么

没有任何面向模型的内容。本包注册 `registerGuard` 与 `registerUpgradeGuard` 守卫、公开的 `/auth/login` 与 `/auth/logout` 路由，以及实例级 `SessionStore`；它不向任何模型请求添加提示词段落、工具 schema 或 session event。

#### Token 影响

零。守卫判定、登录页和会话 cookie 都是 Web 服务器层面的事，不贡献请求 token。

#### KV Cache 影响

无影响。本包既不组装也不发送 provider request，因此不会改变请求 token 或 KV Cache 复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制是当前包约束，不是任务积压。

- **回环保持匿名**——仅当 web 服务器绑定 `0.0.0.0` 或设置了 `publicUrl` 时才激活；两者皆无的回环 HTTP 仍完全可访问。
- **未配置的 token 会禁用登录**——当 `tokenRef` 未解析出非空值时，插件记录警告且每次 `POST /auth/login` 都应答 `401`。
- **会话只驻留进程内存**——服务器重启会销毁所有活跃会话，客户端必须重新登录。
- **旧版 WebServer 构建在激活时失败**——当 `dsh-host-webserver` 缺少 `registerGuard` 或 `registerUpgradeGuard` 时，`apply` 抛出异常。
- **登录页是静态的**——其文案是固定的中文 HTML（`lang="zh-CN"`），不经过 locale 系统。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
