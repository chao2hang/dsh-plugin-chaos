# `@deepseek-ai/dsh-plugin-chaos-auth`

[English](README.md) | 中文

DeepSeek Harness web 服务器的远程访问认证：请求守卫与升级守卫、独立登录页，以及 token 之后的插件实例级浏览器会话。

## 激活

回环保持匿名：当 web 服务器未绑定 `0.0.0.0` 且未配置 `publicUrl` 时，`apply` 直接返回而不注册任何内容。否则插件要求 `dsh-host-webserver` 的当前构建导出 `registerGuard` 和 `registerUpgradeGuard`，在旧版宿主上激活时抛出异常。

登录 token 在启动时通过 credentials 系统从 `tokenRef`（默认 `DSH_AUTH_TOKEN`）解析；token 值不出现在配置中。

## 守卫

两个守卫在路由匹配之前运行：

- 请求守卫放行公开路径（`/auth/login`、`/auth/logout`、`/manifest.webmanifest`，以及带 `token` 查询的 `/`），用会话 cookie 对照存储校验，对未认证页面请求应答登录页、对 API 请求应答 JSON `401`，并在每次已认证请求时刷新会话活动；
- 升级守卫对 WebSocket 升级应用相同的会话校验，失败时以 `401` 响应销毁 socket。

## 路由

- `GET /auth/login` 提供不含应用代码的独立登录页。
- `POST /auth/login` 用恒定时间比较核对提交的 token 与解析值，创建会话，并跳转到连接层的已认证 URL。
- `GET /auth/logout` 与 `POST /auth/logout` 销毁会话、清除 cookie，并重定向到登录页。

## 会话

会话按插件实例驻留在内存中：`dsh-session` cookie 内是 256 位随机 ID（`HttpOnly`、`SameSite=Strict`，HTTPS 下加 `Secure`），滑动空闲超时（默认 7 天）在每次已认证请求时刷新，绝对生命周期上限（默认 30 天）在构造时校验，并有惰性加每 10 分钟一次的周期性清理。cookie 的 `Max-Age` 取两个剩余窗口中较小者。

## 配置

- `idleTimeoutMs`（默认 7 天）与 `absoluteTimeoutMs`（默认 30 天）：会话超时；绝对值必须 >= 空闲值，在激活时校验。
- `tokenRef`（默认 `DSH_AUTH_TOKEN`）：启动时解析的 credentials 引用。
- `publicUrl`（默认空）：反向代理的公网 URL；其 `https://` 前缀启用 `Secure` cookie 标志，非空值还会在回环上激活守卫。

## 模型体验

### 受守卫的 Web 服务器面

#### 模型可见内容

无。本包注册 `registerGuard` 与 `registerUpgradeGuard` 守卫、公开的 `/auth/login` 与 `/auth/logout` 路由，以及实例级 `SessionStore`；它不向任何模型请求添加提示词区块、工具 schema 或 session event。

#### Token 影响

零：守卫判定、登录页和会话 cookie 都是 Web 服务器层面的事，不贡献请求 token。

#### KV Cache 影响

无影响。本包既不组装也不发送 provider request，因此不会改变请求 token 或 KV Cache 复用。

## 已知限制与延后工作

- **回环保持匿名** — 仅当 web 服务器绑定 `0.0.0.0` 或设置了 `publicUrl` 时才激活；两者皆无的回环 HTTP 仍完全可访问。
- **未配置的 token 会禁用登录** — 当 `tokenRef` 未解析出非空值时，插件记录警告且每次 `POST /auth/login` 都应答 `401`。
- **会话只驻留在进程内存中** — 服务器重启会销毁所有活跃会话，客户端必须重新登录。
- **旧版 WebServer 构建在激活时失败** — 当 `dsh-host-webserver` 缺少 `registerGuard` 或 `registerUpgradeGuard` 时，`apply` 抛出异常。
- **登录页是静态的** — 其文案是固定的中文 HTML（`lang="zh-CN"`），不经过 locale 系统。

**运行时不变式：** 不发布伴生入口。会话存储是插件实例级的，没有跨插件状态；守卫注册通过 ctx.effect 事务化完成。
